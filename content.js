let cachedResult = null;
let cacheTimer = null;

// Googleドキュメント等はポップアップを開く瞬間に選択がリセットされるため、
// selectionchange で最後の有効な選択をキャッシュしておく
document.addEventListener('selectionchange', () => {
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    const result = processSelection();
    if (result.hasSelection) {
      cachedResult = result;
      // サイドパネルへリアルタイムプッシュ（パネルが閉じている場合はエラーを無視）
      chrome.runtime.sendMessage({ action: 'selectionChanged', data: result }, () => {
        void chrome.runtime.lastError;
      });
    }
  }, 150);
});

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

    // DOM操作前の rawText を元文字数の計算に使う（D-3: 空白・改行・タブのみ除去）
    const rawText = container.textContent;
    const originalCount = rawText.replace(/\s/g, '').length;

    // ---- DOM ベースの除外 ----
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

    // DOM クリーンアップ後のテキスト（HTMLタグ・href・alt は含まれない）
    let text = container.textContent;

    // ---- テキストベースの除外 ----

    // a. 引用元・参照・出典等の表記を含む行を行ごと除外
    //    長い語順を先に並べて誤マッチを防ぐ（例：「引用元」より先に「引用」が選ばれないよう）
    const citationRegex = /^[^\n]*(引用元|参照元|出典元|参考元|引用|参照|出典|参考)\s*[：:][^\n]*/gm;
    const beforeCitation = text;
    text = text.replace(citationRegex, '');
    if (beforeCitation !== text) appliedRules.push('引用元・参照・出典等の行を除外');

    // b. URL（https:// / http:// / www. 始まり）を除外
    const urlRegex = /(https?:\/\/|www\.)[^ \t\n\r　]*/g;
    const beforeUrl = text;
    text = text.replace(urlRegex, '');
    if (beforeUrl !== text) appliedRules.push('URL を除外');

    // c. リストマーカーを除外（D-4 の対象記号 + 行頭の番号リスト）
    const beforeMarker = text;
    text = text.replace(/[・●○►▶※]/g, '');
    text = text.replace(/^\d+[.）)]\s*/gm, '');
    if (beforeMarker !== text) appliedRules.push('リストマーカーを除外');

    // d. タブ文字を除外
    text = text.replace(/\t/g, '');

    // プレビュー用テキスト：スペースは残して可読性を維持、余分な空行を圧縮
    const previewText = text.replace(/\n{3,}/g, '\n\n').trim();

    // カウント：スペース（半角・全角）と改行を除去して文字数を数える
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
