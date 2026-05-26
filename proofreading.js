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

  // ルール照合
  // text: 校閲対象のテキスト（生テキスト推奨）
  // returns: {
  //   detectionCount: number,        // keyword + replacement の検出件数（ルール単位）
  //   matched: [{rule, matches: [string]}],
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

    list.forEach(rule => {
      if (rule.type === 'checklist') {
        checklist.push(rule);
        return;
      }

      const keywords = Array.isArray(rule.keywords) ? rule.keywords : [];
      const hits = [];
      keywords.forEach(kw => {
        if (typeof kw === 'string' && kw.length > 0 && text.includes(kw)) {
          hits.push(kw);
        }
      });
      if (hits.length > 0) {
        matched.push({ rule, matches: Array.from(new Set(hits)) });
      }
    });

    return {
      detectionCount: matched.length,
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
