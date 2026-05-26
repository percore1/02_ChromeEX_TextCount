// TextCount 全画面校閲ツール
// proofreading.js（window.Proofreading）を再利用し、左右2分割UIで校閲作業を行う

let inputArea, previewArea, resultsList;
let manualList, manualToggle, manualArrow, manualCount;
let statChars, statDetections, statRules;
let filterSourceTab, filterSeverity, sortMode;
let copyBtn, clearBtn;
let rulesStatus, rulesError, rulesErrorMsg;

let lastResult = null;
let debounceTimer = null;
let activeFlashTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  bindDom();
  initInput();
  initModeButtons();
  initFilters();
  initManualToggle();
  initHeaderButtons();

  // ルールの先読み
  if (window.Proofreading) {
    rulesStatus.textContent = 'ルール読込中...';
    window.Proofreading.loadRules().then(rules => {
      const err = window.Proofreading.getLoadError();
      if (err) {
        rulesStatus.textContent = 'ルール読み込み失敗';
        rulesStatus.classList.add('error');
        rulesError.style.display = 'block';
        rulesErrorMsg.textContent = String(err.message || err);
      } else {
        rulesStatus.textContent = 'ルール ' + rules.length + ' 件 読み込み完了';
        rulesStatus.classList.add('loaded');
      }
      // 既に入力があれば検出を走らせる
      loadPendingText();
    });
  }
});

function bindDom() {
  inputArea       = document.getElementById('input-area');
  previewArea     = document.getElementById('preview-area');
  resultsList     = document.getElementById('results-list');
  manualList      = document.getElementById('manual-list');
  manualToggle    = document.getElementById('manual-toggle');
  manualArrow     = document.getElementById('manual-arrow');
  manualCount     = document.getElementById('manual-count');
  statChars       = document.getElementById('stat-chars');
  statDetections  = document.getElementById('stat-detections');
  statRules       = document.getElementById('stat-rules');
  filterSourceTab = document.getElementById('filter-source-tab');
  filterSeverity  = document.getElementById('filter-severity');
  sortMode        = document.getElementById('sort-mode');
  copyBtn         = document.getElementById('copy-btn');
  clearBtn        = document.getElementById('clear-btn');
  rulesStatus     = document.getElementById('rules-status');
  rulesError      = document.getElementById('rules-error');
  rulesErrorMsg   = document.getElementById('rules-error-msg');
}

// ====== 入力の自動チェック（debounce） ======
function initInput() {
  inputArea.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runProofreading, 300);
  });
}

// ====== 表示モード切替 ======
function initModeButtons() {
  document.querySelectorAll('.pane-btn[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pane-btn[data-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const leftContent = document.querySelector('.left-content');
      leftContent.dataset.mode = btn.dataset.mode;
    });
  });
}

// ====== フィルタ・ソート ======
function initFilters() {
  [filterSourceTab, filterSeverity, sortMode].forEach(sel => {
    sel.addEventListener('change', () => renderResults(lastResult));
  });
}

// ====== manual セクション折りたたみ ======
function initManualToggle() {
  manualToggle.addEventListener('click', () => {
    const expanded = manualList.style.display !== 'none';
    manualList.style.display = expanded ? 'none' : 'block';
    manualArrow.classList.toggle('expanded', !expanded);
  });
}

// ====== ヘッダボタン ======
function initHeaderButtons() {
  copyBtn.addEventListener('click', async () => {
    const text = inputArea.value;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const orig = copyBtn.textContent;
      copyBtn.textContent = '✓ コピーしました';
      setTimeout(() => copyBtn.textContent = orig, 1500);
    } catch (e) {
      copyBtn.textContent = '✗ 失敗';
      setTimeout(() => copyBtn.textContent = '📋 コピー', 1500);
    }
  });

  clearBtn.addEventListener('click', () => {
    if (inputArea.value && !confirm('入力内容をクリアしますか？')) return;
    inputArea.value = '';
    runProofreading();
    inputArea.focus();
  });
}

// ====== サイドパネルから引き継いだテキストを読み込む ======
function loadPendingText() {
  if (!chrome || !chrome.storage || !chrome.storage.local) {
    runProofreading();
    return;
  }
  chrome.storage.local.get(['reviewToolText']).then(data => {
    if (data && data.reviewToolText) {
      inputArea.value = data.reviewToolText;
      chrome.storage.local.remove(['reviewToolText']);
    }
    runProofreading();
  }).catch(() => runProofreading());
}

// ====== 校閲実行 ======
function runProofreading() {
  const text = inputArea.value || '';
  updateStat(statChars, text.length);

  if (!window.Proofreading) return;

  window.Proofreading.loadRules().then(rules => {
    const result = window.Proofreading.checkText(text, rules);
    lastResult = { text, ...result };
    renderPreview(text, result.matched);
    renderResults(lastResult);
    renderManual(result.manual);
    updateStat(statDetections, result.detectionCount);
    updateStat(statRules, result.matched.length);
  });
}

function updateStat(el, n) {
  if (el) el.textContent = Number(n).toLocaleString();
}

// ====== プレビュー描画（sentence / span 2層） ======
function renderPreview(text, matched) {
  previewArea.innerHTML = '';
  if (!text) {
    previewArea.textContent = '（入力なし）';
    previewArea.style.color = '#888';
    return;
  }
  previewArea.style.color = '';

  const all = [];
  matched.forEach(m => m.occurrences.forEach(occ => all.push(occ)));

  const sentenceAt = new Array(text.length + 1).fill(null);
  const spanAt = new Array(text.length + 1).fill(null);

  const sentenceOccs = all.filter(o => o.kind === 'sentence')
    .sort((a, b) => (a.end - a.start) - (b.end - b.start));
  sentenceOccs.forEach(o => {
    for (let i = o.start; i < o.end; i++) {
      if (!sentenceAt[i]) sentenceAt[i] = o;
    }
  });

  const spanOccs = all.filter(o => o.kind !== 'sentence')
    .sort((a, b) => a.start - b.start || b.end - a.end);
  spanOccs.forEach(o => {
    for (let i = o.start; i < o.end; i++) {
      if (!spanAt[i]) spanAt[i] = o;
    }
  });

  let pos = 0;
  while (pos < text.length) {
    const curSent = sentenceAt[pos];
    const curSpan = spanAt[pos];
    let end = pos + 1;
    while (end < text.length && sentenceAt[end] === curSent && spanAt[end] === curSpan) end++;
    const seg = text.slice(pos, end);

    let leaf = document.createTextNode(seg);
    if (curSpan) {
      const el = document.createElement('span');
      el.className = 'hl kind-span';
      el.dataset.matchId = curSpan.id;
      el.appendChild(leaf);
      el.addEventListener('click', (ev) => { ev.stopPropagation(); jumpToMatch(curSpan.id); });
      leaf = el;
    }
    if (curSent) {
      const el = document.createElement('span');
      el.className = 'hl kind-sentence';
      el.dataset.matchId = curSent.id;
      el.appendChild(leaf);
      el.addEventListener('click', (ev) => {
        if (ev.target === el) jumpToMatch(curSent.id);
      });
      leaf = el;
    }
    previewArea.appendChild(leaf);
    pos = end;
  }
}

// ====== 結果一覧描画 ======
function renderResults(state) {
  resultsList.innerHTML = '';

  if (!state || !state.matched || state.matched.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = state && state.text
      ? '検出された項目はありません'
      : 'テキストを入力すると検出結果が表示されます';
    resultsList.appendChild(empty);
    return;
  }

  const fSrc = filterSourceTab.value;
  const fSev = filterSeverity.value;

  // flat occurrence list
  const flat = [];
  state.matched.forEach(m => {
    if (fSrc && m.rule.sourceTab !== fSrc) return;
    if (fSev && m.rule.severity !== fSev) return;
    m.occurrences.forEach(occ => flat.push({ rule: m.rule, occ }));
  });

  if (flat.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'フィルタ条件に一致する検出はありません';
    resultsList.appendChild(empty);
    return;
  }

  // sort
  const sevOrder = { critical: 0, error: 1, warning: 2, info: 3, notice: 4 };
  const mode = sortMode.value;
  if (mode === 'severity') {
    flat.sort((a, b) =>
      (sevOrder[a.rule.severity] ?? 9) - (sevOrder[b.rule.severity] ?? 9)
      || a.occ.start - b.occ.start
    );
  } else if (mode === 'category') {
    flat.sort((a, b) =>
      (a.rule.category || '').localeCompare(b.rule.category || '')
      || a.occ.start - b.occ.start
    );
  } else {
    flat.sort((a, b) => a.occ.start - b.occ.start);
  }

  flat.forEach(({ rule, occ }) => {
    resultsList.appendChild(buildResultItem(rule, occ));
  });
}

function buildResultItem(rule, occ) {
  const card = document.createElement('div');
  card.className = 'result-item';
  card.dataset.targetMatchId = occ.id;

  // head
  const head = document.createElement('div');
  head.className = 'result-item-head';

  const sev = rule.severity || 'info';
  const sb = document.createElement('span');
  sb.className = 'badge sev-' + sev;
  sb.textContent = sev.toUpperCase();
  head.appendChild(sb);

  if (rule.sourceTab) {
    const tb = document.createElement('span');
    tb.className = 'badge ' + sourceTabClass(rule.sourceTab);
    tb.textContent = rule.sourceTab;
    head.appendChild(tb);
  }

  if (rule.detectionType) {
    const db = document.createElement('span');
    db.className = 'badge det-tag';
    db.textContent = rule.detectionType;
    head.appendChild(db);
  }

  if (rule.category) {
    const cat = document.createElement('span');
    cat.className = 'result-item-cat';
    cat.textContent = rule.category;
    head.appendChild(cat);
  }

  card.appendChild(head);

  // title
  const title = document.createElement('div');
  title.className = 'result-item-title';
  title.textContent = rule.title || rule.id;
  card.appendChild(title);

  // 該当箇所
  const match = document.createElement('div');
  match.className = 'result-item-match' + (occ.kind === 'sentence' ? ' kind-sentence' : '');
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = '該当:';
  match.appendChild(label);
  const matchText = (occ.kind === 'sentence' && occ.text.length > 80)
    ? occ.text.slice(0, 80) + '…'
    : occ.text;
  match.appendChild(document.createTextNode(' ' + matchText));
  card.appendChild(match);

  // 改善案
  if (rule.recommended) {
    const sug = document.createElement('div');
    sug.className = 'result-item-suggest';
    const l = document.createElement('span');
    l.className = 'label';
    l.textContent = '改善案:';
    sug.appendChild(l);
    sug.appendChild(document.createTextNode(' ' + rule.recommended));
    card.appendChild(sug);
  }

  // 推奨コメント
  const msg = rule.message || rule.basicComment || rule.basic_comment;
  if (msg && msg !== rule.recommended) {
    const cm = document.createElement('div');
    cm.className = 'result-item-comment';
    const l = document.createElement('span');
    l.className = 'label';
    l.textContent = '推奨コメント:';
    cm.appendChild(l);
    cm.appendChild(document.createTextNode(' ' + msg));
    card.appendChild(cm);
  }

  // 補足説明（折りたたみ）
  if (rule.description) {
    const desc = document.createElement('div');
    desc.className = 'result-item-desc';
    desc.textContent = rule.description;
    card.appendChild(desc);
  }

  // 位置情報
  const meta = document.createElement('div');
  meta.className = 'result-item-meta';
  meta.textContent = '位置: ' + occ.start + '〜' + occ.end + ' 文字目（match-id: ' + occ.id + '）';
  card.appendChild(meta);

  card.addEventListener('click', () => {
    // 補足説明の展開トグル（他のカードは閉じる）
    document.querySelectorAll('.result-item.expanded').forEach(el => {
      if (el !== card) el.classList.remove('expanded');
    });
    card.classList.toggle('expanded');

    // プレビュー内の data-match-id 要素へ scrollIntoView
    jumpToMatch(occ.id);
  });

  return card;
}

// ====== ジャンプ（data-match-id ベース） ======
function jumpToMatch(matchId) {
  // プレビューが非表示の場合は split に切替
  const leftContent = document.querySelector('.left-content');
  if (leftContent.dataset.mode === 'input') {
    leftContent.dataset.mode = 'split';
    document.querySelectorAll('.pane-btn[data-mode]').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === 'split')
    );
  }

  const target = previewArea.querySelector('[data-match-id="' + matchId + '"]');
  if (!target) return;

  previewArea.querySelectorAll('.hl.active').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.result-item.active').forEach(el => el.classList.remove('active'));

  target.classList.add('active');
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const card = resultsList.querySelector('.result-item[data-target-match-id="' + matchId + '"]');
  if (card) {
    card.classList.add('active');
    // 結果リスト内でも見える位置にスクロール
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  if (activeFlashTimer) clearTimeout(activeFlashTimer);
  activeFlashTimer = setTimeout(() => {
    target.classList.remove('active');
    if (card) card.classList.remove('active');
  }, 2500);
}

// ====== manual 描画 ======
function renderManual(manual) {
  manualList.innerHTML = '';
  const count = manual ? manual.length : 0;
  manualCount.textContent = String(count);

  if (!manual || manual.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = '手動チェック項目は登録されていません';
    empty.style.cssText = 'color:#888; font-size:11px;';
    manualList.appendChild(empty);
    return;
  }

  const groups = window.Proofreading.groupByCategory(manual, r => r.category);
  groups.forEach(group => {
    const cat = document.createElement('div');
    cat.className = 'manual-cat';
    cat.textContent = group.category;
    manualList.appendChild(cat);
    group.items.forEach(rule => {
      const item = document.createElement('div');
      item.className = 'manual-item';
      item.textContent = rule.title || rule.id;
      item.title = rule.description || '';
      manualList.appendChild(item);
    });
  });
}

// ====== source_tab → CSS クラス ======
function sourceTabClass(sourceTab) {
  switch (sourceTab) {
    case 'ルール校正':           return 'src-rule-correction';
    case 'ルール推敲':           return 'src-rule-refine';
    case 'ルール推敲カテゴリ':   return 'src-rule-category';
    case 'チェックリスト':       return 'src-checklist';
    default:                     return 'src-checklist';
  }
}
