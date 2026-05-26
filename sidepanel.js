// 機能タブ（外側）の現在値
let currentFeature = 'count'; // 'count' | 'proofread'

// 最後に処理した結果を保持（タブ切替時に再描画するため）
let lastResult = null;

document.addEventListener('DOMContentLoaded', () => {
  initFeatureTabs();
  initTabs();
  initPasteTab();
  initFileTab();
  initCopyButton();
  initChecklistCollapse();
  initOpenFullscreen();
  initAutoSync();

  // ルールの先読み（失敗時もアプリは動かす）
  if (window.Proofreading) {
    window.Proofreading.loadRules();
  }
});

// 全画面校閲ツールを開く
function initOpenFullscreen() {
  const btn = document.getElementById('open-fullscreen-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const text = (lastResult && lastResult.rawText) || '';
    const open = () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('review.html') });
    };
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ reviewToolText: text }).then(open).catch(open);
    } else {
      open();
    }
  });
}

// ====== 機能タブ（外側） ======
function initFeatureTabs() {
  document.querySelectorAll('.feature-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.feature-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFeature = tab.dataset.feature;
      applyFeatureView();
    });
  });
}

function applyFeatureView() {
  const countPane = document.getElementById('results');
  const proofreadPane = document.getElementById('proofread-pane');
  const status = document.getElementById('status');

  if (!lastResult || !lastResult.hasSelection) {
    countPane.style.display = 'none';
    proofreadPane.style.display = 'none';
    status.style.display = 'block';
    return;
  }

  status.style.display = 'none';
  if (currentFeature === 'count') {
    countPane.style.display = 'block';
    proofreadPane.style.display = 'none';
  } else {
    countPane.style.display = 'none';
    proofreadPane.style.display = 'block';
    renderProofread(lastResult);
  }
}

// ====== タブ切替（入力タブ） ======
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
      lastResult = null;
      showStatus('テキストを選択・貼り付け・アップロードしてください');
      return;
    }
    const result = processPlainText(text);
    displayResult(result);
  });

  clearBtn.addEventListener('click', () => {
    pasteArea.value = '';
    lastResult = null;
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
  const rawText = text;
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
    rawText,
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
    rawText: rawTextForProofreading,
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

// ====== チェックリスト折りたたみ ======
function initChecklistCollapse() {
  const header = document.getElementById('checklist-header');
  const body = document.getElementById('checklist-body');
  const icon = document.getElementById('checklist-icon');
  if (!header || !body || !icon) return;

  header.addEventListener('click', () => {
    const expanded = body.style.display !== 'none';
    body.style.display = expanded ? 'none' : 'block';
    icon.classList.toggle('expanded', !expanded);
  });
}

// ====== 表示 ======
function displayResult(result) {
  if (!result || !result.hasSelection) {
    lastResult = null;
    setSyncBadge(false);
    showStatus('テキストを選択・貼り付け・アップロードしてください');
    return;
  }

  lastResult = result;
  setSyncBadge(true);
  document.getElementById('status').style.display = 'none';

  renderCount(result);
  applyFeatureView();
}

function renderCount(result) {
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

// ====== 校閲チェック描画 ======
function renderProofread(result) {
  if (!window.Proofreading) return;

  const text = (result && result.rawText) || '';

  window.Proofreading.loadRules().then(rules => {
    const errorBox = document.getElementById('proofread-error');
    const errorMsg = document.getElementById('proofread-error-msg');
    const loadErr = window.Proofreading.getLoadError();
    if (loadErr) {
      errorBox.style.display = 'block';
      errorMsg.textContent = String(loadErr.message || loadErr);
    } else {
      errorBox.style.display = 'none';
    }

    const { detectionCount, matched, manual } =
      window.Proofreading.checkText(text, rules);

    const countEl = document.getElementById('proofread-count');
    countEl.textContent = detectionCount.toLocaleString();
    countEl.classList.toggle('has-detection', detectionCount > 0);

    renderMatched(matched);
    renderProofreadSource(text, matched);
    renderManual(manual);
  });
}

// source_tab → CSS クラス名
function sourceTabClass(sourceTab) {
  switch (sourceTab) {
    case 'ルール校正': return 'source-tab-rule-correction';
    case 'ルール推敲': return 'source-tab-rule-refine';
    case 'ルール推敲カテゴリ': return 'source-tab-rule-category';
    case 'チェックリスト': return 'source-tab-checklist';
    default: return 'source-tab-checklist';
  }
}

function renderMatched(matched) {
  const section = document.getElementById('proofread-matched-section');
  const container = document.getElementById('proofread-matched');
  const empty = document.getElementById('proofread-empty');
  container.innerHTML = '';

  if (!matched || matched.length === 0) {
    section.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  section.style.display = 'block';
  empty.style.display = 'none';

  const groups = window.Proofreading.groupByCategory(matched, item => item.rule.category);
  groups.forEach(group => {
    const block = document.createElement('div');
    block.className = 'proofread-category';

    const title = document.createElement('div');
    title.className = 'proofread-category-title';
    title.textContent = group.category;
    block.appendChild(title);

    group.items.forEach(item => {
      block.appendChild(buildRuleCard(item.rule, item.occurrences));
    });

    container.appendChild(block);
  });
}

function buildRuleCard(rule, occurrences) {
  const card = document.createElement('div');
  card.className = 'proofread-rule';

  const head = document.createElement('div');
  head.className = 'proofread-rule-head';

  // severity バッジ
  const sev = rule.severity || 'info';
  const badge = document.createElement('span');
  badge.className = 'severity-badge severity-' + sev;
  badge.textContent = sev.toUpperCase();
  head.appendChild(badge);

  // source_tab バッジ（ルール校正 / ルール推敲 / ルール推敲カテゴリ / チェックリスト）
  if (rule.sourceTab) {
    const stb = document.createElement('span');
    stb.className = 'source-tab-badge ' + sourceTabClass(rule.sourceTab);
    stb.textContent = rule.sourceTab;
    head.appendChild(stb);
  }

  // detection_type タグ
  if (rule.detectionType) {
    const dt = document.createElement('span');
    dt.className = 'detection-type-tag';
    dt.textContent = rule.detectionType;
    head.appendChild(dt);
  }

  // タイトル
  const title = document.createElement('span');
  title.className = 'proofread-rule-title';
  title.textContent = rule.title || rule.id;
  head.appendChild(title);

  card.appendChild(head);

  // 該当箇所チップ
  if (occurrences && occurrences.length > 0) {
    const matchRow = document.createElement('div');
    matchRow.className = 'proofread-rule-matches';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = '該当箇所 (' + occurrences.length + '):';
    matchRow.appendChild(label);
    occurrences.forEach((occ, idx) => {
      const chip = document.createElement('span');
      const kindCls = (occ.kind === 'sentence') ? ' kind-sentence' : ' kind-span';
      chip.className = 'match-chip' + kindCls;
      // sentence は文冒頭20文字に省略、span はマッチテキストをそのまま
      const display = (occ.kind === 'sentence')
        ? (occ.text.length > 20 ? occ.text.slice(0, 20) + '…' : occ.text)
        : occ.text;
      chip.textContent = display + ' #' + (idx + 1);
      chip.dataset.matchId = occ.id;
      chip.dataset.kind = occ.kind || 'span';
      chip.dataset.keyword = occ.keyword;
      chip.title = (occ.before || '') + '【' + occ.text + '】' + (occ.after || '');
      chip.addEventListener('click', () => jumpToMatch(occ));
      matchRow.appendChild(chip);
    });
    card.appendChild(matchRow);
  }

  // 改善案（推奨ワード）
  if (rule.recommended) {
    const rec = document.createElement('div');
    rec.className = 'proofread-rule-recommend';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = '改善案:';
    rec.appendChild(label);
    rec.appendChild(document.createTextNode(rule.recommended));
    card.appendChild(rec);
  }

  // 推奨コメント（短文）
  const shortMsg = rule.message || rule.basicComment || rule.basic_comment;
  if (shortMsg && shortMsg !== rule.recommended) {
    const comment = document.createElement('div');
    comment.className = 'proofread-rule-comment';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = '推奨コメント:';
    comment.appendChild(label);
    comment.appendChild(document.createTextNode(shortMsg));
    card.appendChild(comment);
  }

  // 補足説明
  if (rule.description) {
    const desc = document.createElement('div');
    desc.className = 'proofread-rule-desc';
    desc.textContent = rule.description;
    card.appendChild(desc);
  }

  return card;
}

// 校閲対象テキストを描画し、occurrences をハイライト（sentence は背景外側、span は内側に重ね描画）
function renderProofreadSource(text, matched) {
  const section = document.getElementById('proofread-source-section');
  const container = document.getElementById('proofread-source');
  if (!section || !container) return;

  container.innerHTML = '';

  if (!text || !matched || matched.length === 0) {
    section.style.display = 'none';
    return;
  }

  const all = [];
  matched.forEach(m => m.occurrences.forEach(occ => all.push(occ)));

  // sentence / span をそれぞれ独立に文字位置マップへ書き込む
  const sentenceAt = new Array(text.length + 1).fill(null);
  const spanAt = new Array(text.length + 1).fill(null);

  const sentenceOccs = all.filter(o => o.kind === 'sentence');
  // sentence は短い範囲を優先（複数文ルールの重なりで内側のものが視認できるように）
  sentenceOccs.sort((a, b) => (a.end - a.start) - (b.end - b.start));
  sentenceOccs.forEach(o => {
    for (let i = o.start; i < o.end; i++) {
      if (!sentenceAt[i]) sentenceAt[i] = o;
    }
  });

  const spanOccs = all.filter(o => o.kind !== 'sentence');
  // span は先勝ち（既存挙動と同等）
  spanOccs.sort((a, b) => a.start - b.start || b.end - a.end);
  spanOccs.forEach(o => {
    for (let i = o.start; i < o.end; i++) {
      if (!spanAt[i]) spanAt[i] = o;
    }
  });

  // 文字を線形に走査し、同じ (sentenceId, spanId) が続く区間ごとに DOM を作る
  let pos = 0;
  while (pos < text.length) {
    const curSent = sentenceAt[pos];
    const curSpan = spanAt[pos];
    let end = pos + 1;
    while (end < text.length && sentenceAt[end] === curSent && spanAt[end] === curSpan) end++;
    const segText = text.slice(pos, end);

    let leaf = document.createTextNode(segText);
    if (curSpan) {
      const el = document.createElement('span');
      el.className = 'hl kind-span';
      el.dataset.matchId = curSpan.id;
      el.appendChild(leaf);
      el.addEventListener('click', (ev) => { ev.stopPropagation(); jumpToMatch(curSpan); });
      leaf = el;
    }
    if (curSent) {
      const el = document.createElement('span');
      el.className = 'hl kind-sentence';
      el.dataset.matchId = curSent.id;
      el.appendChild(leaf);
      el.addEventListener('click', (ev) => {
        // 内側 span のクリックは span が処理。sentence 要素自体のクリック時のみジャンプ
        if (ev.target === el || (ev.target.parentElement === el && !ev.target.classList.contains('kind-span'))) {
          jumpToMatch(curSent);
        }
      });
      leaf = el;
    }
    container.appendChild(leaf);
    pos = end;
  }

  section.style.display = 'block';
}

let activeMatchClearTimer = null;

function jumpToMatch(occ) {
  // 1) 校閲ペイン内のハイライトへスクロール＆強調
  const span = document.querySelector('.proofread-source .hl[data-match-id="' + occ.id + '"]');
  document.querySelectorAll('.proofread-source .hl.active').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.match-chip.active').forEach(el => el.classList.remove('active'));

  if (span) {
    span.classList.add('active');
    span.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const chip = document.querySelector('.match-chip[data-match-id="' + occ.id + '"]');
  if (chip) chip.classList.add('active');

  if (activeMatchClearTimer) clearTimeout(activeMatchClearTimer);
  activeMatchClearTimer = setTimeout(() => {
    if (span) span.classList.remove('active');
    if (chip) chip.classList.remove('active');
  }, 2500);

  // 2) 自動タブの場合はページ本文側にもジャンプ要求
  const autoTabActive = document.getElementById('tab-auto')?.classList.contains('active');
  if (autoTabActive) {
    requestPageHighlight(occ);
  }
}

function requestPageHighlight(occ) {
  if (!lastResult || !lastResult.rawText) return;
  const text = lastResult.rawText;
  const isSentence = occ.kind === 'sentence';

  // 検索キー：span はそのまま、sentence は空白を畳んだ冒頭プレフィックス（content.js 側でさらに正規化）
  const key = occ.keyword;
  if (!key) return;

  // 同一キーワードのうち何番目か（rawText 上で算出）
  let nth = 0;
  let from = 0;
  while (from <= text.length) {
    const idx = text.indexOf(key, from);
    if (idx === -1) break;
    if (idx === occ.start) break;
    nth += 1;
    from = idx + key.length;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) return;
    chrome.tabs.sendMessage(
      tabs[0].id,
      {
        action: 'highlightInPage',
        keyword: key,
        occurrenceIndex: nth,
        allowCrossNode: isSentence
      },
      () => { void chrome.runtime.lastError; }
    );
  });
}

function renderManual(manual) {
  const container = document.getElementById('checklist-body');
  const countBadge = document.getElementById('manual-count');
  container.innerHTML = '';

  const count = manual ? manual.length : 0;
  if (countBadge) countBadge.textContent = String(count);

  if (!manual || manual.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-message';
    empty.textContent = '手動チェック項目は登録されていません';
    container.appendChild(empty);
    return;
  }

  const groups = window.Proofreading.groupByCategory(manual, r => r.category);
  groups.forEach(group => {
    const block = document.createElement('div');
    block.className = 'checklist-category';

    const title = document.createElement('div');
    title.className = 'checklist-category-title';
    title.textContent = group.category;
    block.appendChild(title);

    group.items.forEach(rule => {
      const item = document.createElement('div');
      item.className = 'checklist-item';
      item.textContent = rule.title || rule.id;
      item.title = rule.description || '';
      block.appendChild(item);
    });

    container.appendChild(block);
  });
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
  document.getElementById('proofread-pane').style.display = 'none';
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
