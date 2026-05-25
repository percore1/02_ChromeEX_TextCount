document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initPasteTab();
  initFileTab();
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
    let text;
    if (name.endsWith('.txt')) {
      text = await file.text();
      fileInfo.textContent = `${file.name}（${formatBytes(file.size)}）を読み込みました`;
      const result = processPlainText(text);
      displayResult(result);
    } else if (name.endsWith('.docx')) {
      const arrayBuffer = await file.arrayBuffer();
      const html = (await mammoth.convertToHtml({ arrayBuffer })).value;
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

// ====== テキスト処理 ======
// プレーンテキスト用（貼り付け・.txt）。DOMベースの除外ルールは適用されない
function processPlainText(text) {
  const originalCount = text.replace(/\s/g, '').length;
  const appliedRules = [];

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

  return {
    hasSelection: true,
    countedLength,
    originalCount,
    excludedCount: originalCount - countedLength,
    previewText,
    appliedRules
  };
}

// HTML 用（.docx をmammothで変換した結果）。DOMベースの除外ルールも適用
function processHtml(html) {
  const container = document.createElement('div');
  container.innerHTML = html;

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

  return {
    hasSelection: true,
    countedLength,
    originalCount,
    excludedCount: originalCount - countedLength,
    previewText,
    appliedRules
  };
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
