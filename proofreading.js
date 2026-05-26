// 校閲チェックエンジン（ルール読み込み・キャッシュ・照合）
// グローバル: window.Proofreading を公開する

(function () {
  const RULES_URL = chrome.runtime.getURL('rules/proofreading_rules.json');

  let cachedRules = null;
  let loadPromise = null;
  let loadError = null;

  function loadRules() {
    if (cachedRules) return Promise.resolve(cachedRules);
    if (loadPromise) return loadPromise;

    loadPromise = fetch(RULES_URL)
      .then(res => {
        if (!res.ok) throw new Error(`rules fetch failed: ${res.status}`);
        return res.json();
      })
      .then(rules => {
        if (!Array.isArray(rules)) throw new Error('rules is not an array');
        cachedRules = rules.filter(r => r && r.enabled !== false);
        loadError = null;
        return cachedRules;
      })
      .catch(err => {
        loadError = err;
        cachedRules = [];
        return cachedRules;
      });

    return loadPromise;
  }

  function getLoadError() {
    return loadError;
  }

  const CONTEXT_LEN = 20;

  function findOccurrences(text, keyword) {
    const out = [];
    if (typeof keyword !== 'string' || keyword.length === 0) return out;
    let from = 0;
    while (from <= text.length) {
      const idx = text.indexOf(keyword, from);
      if (idx === -1) break;
      const end = idx + keyword.length;
      out.push({
        keyword,
        start: idx,
        end,
        text: text.slice(idx, end),
        before: text.slice(Math.max(0, idx - CONTEXT_LEN), idx),
        after: text.slice(end, end + CONTEXT_LEN)
      });
      from = end;
    }
    return out;
  }

  // ルール照合
  // text: 校閲対象のテキスト（生テキスト推奨）
  // returns: {
  //   detectionCount: number,        // 総出現回数（occurrencesの合計）
  //   matched: [{rule, occurrences: [{id, keyword, start, end, text, before, after}]}],
  //   checklist: [rule],             // 常時表示用
  // }
  function checkText(text, rules) {
    const list = rules || cachedRules || [];
    const matched = [];
    const checklist = [];

    if (!text) {
      list.forEach(r => {
        if (r.type === 'checklist') checklist.push(r);
      });
      return { detectionCount: 0, matched, checklist };
    }

    let totalCount = 0;
    let matchIdCounter = 0;

    list.forEach(rule => {
      if (rule.type === 'checklist') {
        checklist.push(rule);
        return;
      }

      const keywords = Array.isArray(rule.keywords) ? rule.keywords : [];
      const occurrences = [];
      keywords.forEach(kw => {
        findOccurrences(text, kw).forEach(occ => {
          occurrences.push(occ);
        });
      });

      if (occurrences.length > 0) {
        occurrences.sort((a, b) => a.start - b.start);
        occurrences.forEach(occ => {
          matchIdCounter += 1;
          occ.id = 'match-' + String(matchIdCounter).padStart(3, '0');
        });
        totalCount += occurrences.length;
        matched.push({ rule, occurrences });
      }
    });

    return {
      detectionCount: totalCount,
      matched,
      checklist
    };
  }

  // カテゴリ別にグルーピング
  function groupByCategory(items, getCategory) {
    const map = new Map();
    items.forEach(item => {
      const cat = getCategory(item) || '(未分類)';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(item);
    });
    return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
  }

  window.Proofreading = {
    loadRules,
    getLoadError,
    checkText,
    groupByCategory
  };
})();
