document.addEventListener('DOMContentLoaded', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      showStatus('タブ情報を取得できませんでした。');
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, { action: 'getSelection' }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus(
          'このページでは使用できません。\n' +
          '通常のWebページでテキストを選択してから開いてください。'
        );
        return;
      }
      displayResult(response);
    });
  });
});

function displayResult(result) {
  if (!result || !result.hasSelection) {
    showStatus('テキストを選択してから、この拡張機能を開いてください。');
    return;
  }

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

  // 常に適用される基本ルールを最初に表示
  addRuleItem(rulesList, 'スペース・改行・タブを除外');

  // content.js から返された適用済みルールを追加
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
