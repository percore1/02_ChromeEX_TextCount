let cachedResult = null;
let cacheTimer = null;

function triggerSelectionCheck() {
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    const result = processSelection();
    if (result.hasSelection) {
      cachedResult = result;
      chrome.runtime.sendMessage({ action: 'selectionChanged', data: result }, () => {
        void chrome.runtime.lastError;
      });
    }
  }, 150);
}

document.addEventListener('selectionchange', triggerSelectionCheck, true);
document.addEventListener('mouseup', triggerSelectionCheck);
document.addEventListener('keyup', triggerSelectionCheck);

if (window.location.hostname === 'docs.google.com') {
  let lastSelText = '';
  setInterval(() => {
    const sel = window.getSelection();
    const text = sel ? sel.toString() : '';
    if (text !== lastSelText) {
      lastSelText = text;
      if (text) triggerSelectionCheck();
    }
  }, 400);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSelection') {
    const liveResult = processSelection();
    sendResponse(liveResult.hasSelection ? liveResult : (cachedResult || { hasSelection: false }));
  }
  return true;
});

function injectBlockNewlines(container) {
  const blockSelectors = 'p,div,h1,h2,h3,h4,h5,h6,li,blockquote,tr,address,article,section,header,footer,main,nav';
  container.querySelectorAll(blockSelectors).forEach(el => {
    el.appendChild(document.createTextNode('\n'));
  });
  container.querySelectorAll('br').forEach(el => {
    el.replaceWith(document.createTextNode('\n'));
  });
}

// リテラルな見出しタグ（半角/全角括弧）から問題を抽出
function detectTagWarnings(text) {
  const warnings = [];

  // すべての見出しタグ候補を抽出（半角・全角括弧の両方）
  const allTagsRe = /[<＜]\s*\/?\s*h([1-6])[^>＞]*[>＞]/gi;
  const allTags = [...text.matchAll(allTagsRe)];

  // 全角括弧を含むタグを警告
  allTags.forEach(m => {
    if (/[＜＞]/.test(m[0])) {
      warnings.push(`全角括弧を含む見出しタグ：${m[0]}`);
    }
  });

  // 開閉数の不一致を警告
  const openCount = {};
  const closeCount = {};
  allTags.forEach(m => {
    const isClose = /[<＜]\s*\//.test(m[0]);
    const level = m[1];
    if (isClose) closeCount[level] = (closeCount[level] || 0) + 1;
    else openCount[level] = (openCount[level] || 0) + 1;
  });
  for (let i = 1; i <= 6; i++) {
    const o = openCount[i] || 0;
    const c = closeCount[i] || 0;
    if (o > c) warnings.push(`<h${i}> の閉じタグが不足（開き${o}件 / 閉じ${c}件）`);
    else if (c > o) warnings.push(`</h${i}> の開きタグが不足（開き${o}件 / 閉じ${c}件）`);
  }

  return [...new Set(warnings)];
}

function processSelection() {
  try {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0 || selection.toString() === '') {
      return { hasSelection: false };
    }

    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();
    const container = document.createElement('div');
    container.appendChild(fragment);

    injectBlockNewlines(container);

    const rawText = container.textContent;

    if (!rawText.trim()) {
      const fallbackText = selection.toString();
      if (!fallbackText.trim()) return { hasSelection: false };
      const originalCount = fallbackText.replace(/\s/g, '').length;
      const countedLength = fallbackText.replace(/[ \n\r　\t]/g, '').length;
      return {
        hasSelection: true,
        countedLength,
        originalCount,
        excludedCount: originalCount - countedLength,
        previewText: fallbackText.replace(/\n{3,}/g, '\n\n').trim(),
        rawText: fallbackText,
        appliedRules: [],
        warnings: []
      };
    }

    const originalCount = rawText.replace(/\s/g, '').length;
    const rawTextForProofreading = rawText;

    const appliedRules = [];

    const headings = container.querySelectorAll('h1,h2,h3,h4,h5,h6');
    if (headings.length > 0) {
      headings.forEach(el => el.remove());
      appliedRules.push('h1〜h6 見出しを除外');
    }

    const blockquotes = container.querySelectorAll('blockquote');
    if (blockquotes.length > 0) {
      blockquotes.forEach(el => el.remove());
      appliedRules.push('blockquote を除外');
    }

    let text = container.textContent;

    // 警告の検出は除外処理前に行う
    const warnings = detectTagWarnings(text);

    // リテラル見出しタグの除外（半角/全角括弧の両方、開閉のペア＋孤立タグ）
    const beforeHeadingTag = text;
    text = text.replace(/[<＜]h([1-6])[^>＞]*[>＞][\s\S]*?[<＜]\s*\/h\1[>＞]/gi, '');
    text = text.replace(/[<＜]\s*\/?\s*h[1-6][^>＞]*[>＞]/gi, '');
    if (beforeHeadingTag !== text) appliedRules.push('見出しタグ（文字列）を除外');

    const citationRegex = /^[^\n]*(引用元|参照元|出典元|参考元|引用|参照|出典|参考)\s*[：:][^\n]*/gm;
    const beforeCitation = text;
    text = text.replace(citationRegex, '');
    if (beforeCitation !== text) appliedRules.push('引用元・参照・出典等の行を除外');

    const urlRegex = /(https?:\/\/|www\.)[^ \t\n\r　]*/g;
    const beforeUrl = text;
    text = text.replace(urlRegex, '');
    if (beforeUrl !== text) appliedRules.push('URL を除外');

    const beforeMarker = text;
    text = text.replace(/[・●○►▶※]/g, '');
    text = text.replace(/^\d+[.）)]\s*/gm, '');
    if (beforeMarker !== text) appliedRules.push('リストマーカーを除外');

    // 価格表記を除外（¥/￥ + 数値、または 数値 + 円）
    const beforePrice = text;
    text = text.replace(/[¥￥]\s*\d[\d,]*(?:\.\d+)?/g, '');
    text = text.replace(/\d[\d,]*(?:\.\d+)?\s*円/g, '');
    if (beforePrice !== text) appliedRules.push('価格表記を除外');

    text = text.replace(/\t/g, '');

    const previewText = text.replace(/\n{3,}/g, '\n\n').trim();
    const countedLength = text.replace(/[ \n\r　]/g, '').length;
    const excludedCount = originalCount - countedLength;

    return {
      hasSelection: true,
      countedLength,
      originalCount,
      excludedCount,
      previewText,
      rawText: rawTextForProofreading,
      appliedRules,
      warnings
    };
  } catch (e) {
    return { hasSelection: false };
  }
}
