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

// capture: true — GoogleドキュメントのstopImmediatePropagationを回避
document.addEventListener('selectionchange', triggerSelectionCheck, true);
// mouseup/keyup — selectionchangeが発火しない環境への追加トリガー
document.addEventListener('mouseup', triggerSelectionCheck);
document.addEventListener('keyup', triggerSelectionCheck);

// Googleドキュメント対応: ポーリングで選択テキストの変化を検出
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

    const rawText = container.textContent;

    // cloneContentsが空の場合（Googleドキュメントキャンバスモード等）のフォールバック
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
        appliedRules: []
      };
    }

    const originalCount = rawText.replace(/\s/g, '').length;

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
      appliedRules
    };
  } catch (e) {
    return { hasSelection: false };
  }
}
