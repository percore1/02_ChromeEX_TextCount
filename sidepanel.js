document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initPasteTab();
  initFileTab();
  initCopyButton();
  initAutoSync();
});

// ====== タブ切替 ======
function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.target).classList.add('active');
    });
  });
}

// ====== 自動同期（選択検出） ======
function initAutoSync() {
  fetchSelection();

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.action !== 'selectionChanged') return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && sender.tab && sender.tab.id === tabs[0].id) {
        displayResult(message.data);
      }
    });
  });

  chrome.tabs.onActivated.addListener(() => {
    setSyncBadge(false);
    showStatus('テキストを選択・貼り付け・アップロードしてください');
    fetchSelection();
  });
}

function fetchSelection() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) return;
    const tabId = tabs[0].id;

    chrome.tabs.sendMessage(tabId, { action: 'getSelection' }, (response) => {
      if (chrome.runtime.lastError) {
        chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: ['content.js']
        }).then(() => {
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { action: 'getSelection' }, (res) => {
              if (!chrome.runtime.lastError && res && res.hasSelection) displayResult(res);
            });
          }, 100);
        }).catch(() => { /* 拡張不可ページ。サイレント */ });
        return;
      }
      if (response && response.hasSelection) displayResult(response);
    });
  });
}

// ====== 貼り付けタブ ======
function initPasteTab() {
  const pasteArea = document.getElementById('paste-area');
  const clearBtn = document.getElementById('paste-clear');

  pasteArea.addEventListener('input', () => {
    const text = pasteArea.value;
    if (!text.trim()) {
      showStatus('テキストを選択・貼り付け・アップロードしてください');
      return;
    }
    const result = processPlainText(text);
    displayResult(result);
  });

  clearBtn.addEventListener('click', () => {
    pasteArea.value = '';
    showStatus('テキストを選択・貼り付け・アップロードしてください');
  });
}

// ====== ファイルタブ ======
function initFileTab() {
  const dropZone = document.getElementById('file-drop');
  const fileInput = document.getElementById('file-input');
  const fileInfo = document.getElementById('file-info');

  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0], fileInfo);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0], fileInfo);
  });
}

async function handleFile(file, fileInfo) {
  const name = file.name.toLowerCase();
  fileInfo.style.display = 'block';
  fileInfo.classList.remove('error');
  fileInfo.textContent = `読み込み中: ${file.name}`;

  try {
    if (name.endsWith('.txt')) {
      const text = await file.text();
      fileInfo.textContent = `${file.name}（${formatBytes(file.size)}）を読み込みました`;
      const result = processPlainText(text);
      displayResult(result);
    } else if (name.endsWith('.docx')) {
      const arrayBuffer = await file.arrayBuffer();
      const styleMap = [
        "p[style-name='見出し 1'] => h1:fresh",
        "p[style-name='見出し 2'] => h2:fresh",
        "p[style-name='見出し 3'] => h3:fresh",
        "p[style-name='見出し 4'] => h4:fresh",
        "p[style-name='見出し 5'] => h5:fresh",
        "p[style-name='見出し 6'] => h6:fresh",
        "p[style-name='見出し1'] => h1:fresh",
        "p[style-name='見出し2'] => h2:fresh",
        "p[style-name='見出し3'] => h3:fresh",
        "p[style-name='見出し4'] => h4:fresh",
        "p[style-name='見出し5'] => h5:fresh",
        "p[style-name='見出し6'] => h6:fresh",
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='タイトル'] => h1:fresh",
        "p[style-name='サブタイトル'] => h2:fresh"
      ];
      const html = (await mammoth.convertToHtml({ arrayBuffer }, { styleMap })).value;
      fileInfo.textContent = `${file.name}（${formatBytes(file.size)}）を読み込みました`;
      const result = processHtml(html);
      displayResult(result);
    } else {
      throw new Error('対応していないファイル形式です（.txt / .docx のみ）');
    }
  } catch (e) {
    fileInfo.classList.add('error');
    fileInfo.textContent = `エラー: ${e.message || 'ファイルの読み込みに失敗しました'}`;
    showStatus('テキストを選択・貼り付け・アップロードしてください');
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ====== 共通ユーティリティ ======
function injectBlockNewlines(container) {
  const blockSelectors = 'p,div,h1,h2,h3,h4,h5,h6,li,blockquote,tr,address,article,section,header,footer,main,nav';
  container.querySelectorAll(blockSelectors).forEach(el => {
    el.appendChild(document.createTextNode('\n'));
  });
  container.querySelectorAll('br').forEach(el => {
    el.replaceWith(document.createTextNode('\n'));
  });
}

function detectTagWarnings(text) {
  const warnings = [];

  const allTagsRe = /[<＜]\s*\/?\s*h([1-6])[^>＞]*[>＞]/gi;
  const allTags = [...text.matchAll(allTagsRe)];

  allTags.forEach(m => {
    if (/[＜＞]/.test(m[0])) {
      warnings.push(`全角括弧を含む見出しタグ：${m[0]}`);
    }
  });

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

// テキスト共通の除外ルール（リテラル見出し・引用・URL・マーカー・価格・タブ）
function applyTextExclusions(text, appliedRules) {
  // リテラル見出しタグの除外（半角/全角括弧対応、ペア＋孤立タグ）
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
  return text;
}

// ====== テキスト処理 ======
// プレーンテキスト用（貼り付け・.txt）
function processPlainText(text) {
  const originalCount = text.replace(/\s/g, '').length;
  const appliedRules = [];
  const warnings = detectTagWarnings(text);

  text = applyTextExclusions(text, appliedRules);

  const previewText = text.replace(/\n{3,}/g, '\n\n').trim();
  const countedLength = text.replace(/[ \n\r　]/g, '').length;

  return {
    hasSelection: true,
    countedLength,
    originalCount,
    excludedCount: originalCount - countedLength,
    previewText,
    appliedRules,
    warnings
  };
}

// HTML 用（.docx をmammothで変換した結果）
function processHtml(html) {
  const container = document.createElement('div');
  container.innerHTML = html;

  injectBlockNewlines(container);

  const rawText = container.textContent;
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

  const warnings = detectTagWarnings(text);
  text = applyTextExclusions(text, appliedRules);

  const previewText = text.replace(/\n{3,}/g, '\n\n').trim();
  const countedLength = text.replace(/[ \n\r　]/g, '').length;

  return {
    hasSelection: true,
    countedLength,
    originalCount,
    excludedCount: originalCount - countedLength,
    previewText,
    appliedRules,
    warnings
  };
}

// ====== コピーボタン ======
function initCopyButton() {
  const copyBtn = document.getElementById('copy-btn');
  let copyTimer = null;

  copyBtn.addEventListener('click', async () => {
    const text = document.getElementById('preview').textContent;
    if (!text || text === '（カウント対象テキストなし）') return;
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = '✓ コピーしました';
      copyBtn.classList.add('copied');
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copyBtn.textContent = '📋 コピー';
        copyBtn.classList.remove('copied');
      }, 2000);
    } catch (e) {
      copyBtn.textContent = '✗ コピー失敗';
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copyBtn.textContent = '📋 コピー';
      }, 2000);
    }
  });
}

// ====== 表示 ======
function displayResult(result) {
  if (!result || !result.hasSelection) {
    setSyncBadge(false);
    showStatus('テキストを選択・貼り付け・アップロードしてください');
    return;
  }

  setSyncBadge(true);
  document.getElementById('status').style.display = 'none';
  document.getElementById('results').style.display = 'block';

  document.getElementById('counted-length').textContent =
    result.countedLength.toLocaleString();
  document.getElementById('original-count').textContent =
    result.originalCount.toLocaleString();
  document.getElementById('excluded-count').textContent =
    result.excludedCount.toLocaleString();

  const rulesList = document.getElementById('applied-rules');
  rulesList.innerHTML = '';
  addRuleItem(rulesList, 'スペース・改行・タブを除外');
  (result.appliedRules || []).forEach(rule => addRuleItem(rulesList, rule));

  // 警告セクション
  const warningsSection = document.getElementById('warnings-section');
  const warningsList = document.getElementById('warnings-list');
  warningsList.innerHTML = '';
  if (result.warnings && result.warnings.length > 0) {
    warningsSection.style.display = 'block';
    result.warnings.forEach(w => {
      const li = document.createElement('li');
      li.textContent = w;
      warningsList.appendChild(li);
    });
  } else {
    warningsSection.style.display = 'none';
  }

  const preview = document.getElementById('preview');
  preview.textContent = result.previewText || '（カウント対象テキストなし）';
}

function addRuleItem(list, text) {
  const li = document.createElement('li');
  li.textContent = text;
  list.appendChild(li);
}

function showStatus(message) {
  document.getElementById('status').textContent = message;
  document.getElementById('status').style.display = 'block';
  document.getElementById('results').style.display = 'none';
}

function setSyncBadge(active) {
  const badge = document.getElementById('sync-badge');
  if (active) {
    badge.textContent = '同期中';
    badge.className = 'sync-badge sync-active';
  } else {
    badge.textContent = '待機中';
    badge.className = 'sync-badge sync-waiting';
  }
}
