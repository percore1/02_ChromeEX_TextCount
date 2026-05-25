document.addEventListener('DOMContentLoaded', () => {
  fetchSelection();

  // content.js からのリアルタイム更新を受け取る
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.action !== 'selectionChanged') return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && sender.tab && sender.tab.id === tabs[0].id) {
        displayResult(message.data);
      }
    });
  });

  // タブ切り替え時にリセット＆再取得
  chrome.tabs.onActivated.addListener(() => {
    setSyncBadge(false);
    showStatus('テキストを選択すると自動的にカウントされます');
    fetchSelection();
  });
});

function fetchSelection() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) return;
    const tabId = tabs[0].id;

    chrome.tabs.sendMessage(tabId, { action: 'getSelection' }, (response) => {
      if (chrome.runtime.lastError) {
        // content.js が未注入（拡張機能更新前から開いているタブなど）→ 動的注入
        chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: ['content.js']
        }).then(() => {
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { action: 'getSelection' }, (res) => {
              if (!chrome.runtime.lastError) displayResult(res);
            });
          }, 100);
        }).catch(() => {
          showStatus('このページでは使用できません。');
        });
        return;
      }
      displayResult(response);
    });
  });
}

function displayResult(result) {
  if (!result || !result.hasSelection) {
    setSyncBadge(false);
    showStatus('テキストを選択すると自動的にカウントされます');
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
