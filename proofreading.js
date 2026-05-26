// 校閲チェックエンジン（detector ディスパッチャ）
// グローバル: window.Proofreading を公開
//
// 入力データ: text_checklist.json（プロジェクト直下）
// 対応 detection_type: exact / dictionary / regex / sentence_metric / sequence / heuristic / manual

(function () {
  const RULES_URL = chrome.runtime.getURL('text_checklist.json');

  let cachedRules = null;
  let loadPromise = null;
  let loadError = null;

  // ====== ルール読み込み ======
  function loadRules() {
    if (cachedRules) return Promise.resolve(cachedRules);
    if (loadPromise) return loadPromise;

    loadPromise = fetch(RULES_URL)
      .then(res => {
        if (!res.ok) throw new Error('rules fetch failed: ' + res.status);
        return res.json();
      })
      .then(rules => {
        if (!Array.isArray(rules)) throw new Error('rules is not an array');
        cachedRules = rules
          .filter(r => r && r.enabled !== false)
          .map(normalizeRule);
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

  function getLoadError() { return loadError; }

  // ====== ルール正規化（新スキーマ → 内部正規形 + 旧フィールド互換） ======
  function normalizeRule(raw) {
    const keywords = splitKeyword(raw.keyword);
    const sev = (raw.severity || 'info').toLowerCase();
    const detType = (raw.detection_type || (raw.recommended_word ? 'exact' : 'manual')).toLowerCase();
    return {
      id: String(raw.id),
      ruleType: raw.rule_type || '',
      sourceTab: raw.source_tab || '',
      detectionType: detType,
      autoDetectable: raw.auto_detectable !== false,
      category: raw.category || '(未分類)',
      severity: sev,
      title: raw.check_item || raw.title || ('rule-' + raw.id),
      description: raw.explanation || raw.description || '',
      message: raw.message || raw.basic_comment_preview || '',
      basicComment: raw.basic_comment_preview || raw.basic_comment || '',
      recommended: raw.recommended_word || raw.replacement || '',
      examples: raw.examples || '',
      implementationNote: raw.implementation_note || '',
      keyword: raw.keyword || '',
      keywords,
      pattern: raw.pattern || '',
      // --- 旧UI互換 ---
      type: detType === 'manual' ? 'checklist' : (raw.recommended_word ? 'replacement' : 'keyword'),
      basic_comment: raw.basic_comment_preview || raw.basic_comment || '',
      replacement: raw.recommended_word || raw.replacement || ''
    };
  }

  function splitKeyword(kw) {
    if (!kw || typeof kw !== 'string') return [];
    return kw.split(/[;；]/).map(s => s.trim()).filter(s => s.length > 0);
  }

  // ====== 文分割 ======
  function splitSentences(text) {
    if (!text) return [];
    const sentences = [];
    let buf = '';
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      buf += ch;
      const isDelim = /[。．！？!?]/.test(ch) || ch === '\n';
      if (isDelim) {
        if (buf.trim().length > 0) {
          sentences.push({ start, end: i + 1, text: buf });
        }
        start = i + 1;
        buf = '';
      }
    }
    if (buf.trim().length > 0) {
      sentences.push({ start, end: text.length, text: buf });
    }
    return sentences;
  }

  // ====== オカレンスビルダー ======
  const CONTEXT_LEN = 20;

  function buildSpanOccurrence(text, start, end, keyword) {
    return {
      kind: 'span',
      keyword: keyword,
      start, end,
      text: text.slice(start, end),
      before: text.slice(Math.max(0, start - CONTEXT_LEN), start),
      after: text.slice(end, end + CONTEXT_LEN)
    };
  }

  function buildSentenceOccurrence(text, sentence) {
    // 前後の空白・改行をトリムした範囲を選ぶ
    let s = sentence.start;
    let e = sentence.end;
    while (s < e && /\s/.test(text[s])) s += 1;
    while (e > s && /\s/.test(text[e - 1])) e -= 1;
    const sentText = text.slice(s, e);
    // ページ内ジャンプ用プレフィックス（改行除去・前後空白除去・25文字）
    const prefix = sentText.replace(/\s+/g, '').slice(0, 25);
    return {
      kind: 'sentence',
      keyword: prefix || sentText.slice(0, 20),
      start: s, end: e,
      text: sentText,
      before: '',
      after: ''
    };
  }

  // ====== Detectors ======
  function detectExact(text, rule) {
    const out = [];
    rule.keywords.forEach(kw => {
      if (!kw) return;
      let from = 0;
      while (from <= text.length) {
        const idx = text.indexOf(kw, from);
        if (idx === -1) break;
        out.push(buildSpanOccurrence(text, idx, idx + kw.length, kw));
        from = idx + kw.length;
      }
    });
    return out;
  }

  function detectRegex(text, rule) {
    if (!rule.pattern) return [];
    let re;
    try {
      re = new RegExp(rule.pattern, 'gu');
    } catch (e) {
      console.warn('[proofreading] invalid regex (rule ' + rule.id + '):', e.message);
      return [];
    }
    const out = [];
    let m;
    let safety = 0;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const matchLen = (m[0] || '').length;
      const end = start + matchLen;
      if (matchLen > 0 && end <= text.length) {
        out.push(buildSpanOccurrence(text, start, end, m[0]));
      } else {
        re.lastIndex = start + 1;
      }
      if (++safety > 20000) break;
    }
    return out;
  }

  // DSL: "sentence_length>=100" / "comma_count>=4" / "sentence_length>=50 AND comma_count==0"
  function parseMetricPattern(pattern) {
    if (!pattern) return null;
    const tokens = pattern.split(/\s+AND\s+/i).map(s => s.trim());
    const conds = [];
    for (const tok of tokens) {
      const m = tok.match(/^(sentence_length|comma_count)\s*(>=|<=|==|>|<)\s*(\d+)$/);
      if (!m) return null;
      conds.push({ key: m[1], op: m[2], val: parseInt(m[3], 10) });
    }
    return conds;
  }

  function evalMetric(conds, sLen, cCount) {
    for (const c of conds) {
      const v = c.key === 'sentence_length' ? sLen : cCount;
      if (c.op === '>=' && !(v >= c.val)) return false;
      if (c.op === '<=' && !(v <= c.val)) return false;
      if (c.op === '==' && !(v === c.val)) return false;
      if (c.op === '>'  && !(v >  c.val)) return false;
      if (c.op === '<'  && !(v <  c.val)) return false;
    }
    return true;
  }

  function detectSentenceMetric(text, rule) {
    const conds = parseMetricPattern(rule.pattern);
    if (!conds) return [];
    const sentences = splitSentences(text);
    const out = [];
    sentences.forEach(sent => {
      const inner = sent.text;
      const sLen = inner.replace(/\s/g, '').length;
      const cCount = (inner.match(/[、，]/g) || []).length;
      if (evalMetric(conds, sLen, cCount)) {
        const occ = buildSentenceOccurrence(text, sent);
        if (occ.end > occ.start) out.push(occ);
      }
    });
    return out;
  }

  // ====== Sequence ======
  function detectSequence(text, rule) {
    const p = rule.pattern || '';
    if (/alias_groups/i.test(p))           return detectAliasGroups(text, p);
    if (/same_sentence_ending/i.test(p))   return detectSameSentenceEnding(text);
    if (/same_particle/i.test(p))          return detectSameParticle(text);
    return [];
  }

  function detectAliasGroups(text, pattern) {
    const m = pattern.match(/alias_groups\s*:\s*(.+)$/i);
    if (!m) return [];
    const groups = m[1].split('|')
      .map(g => g.split('/').map(s => s.trim()).filter(s => s.length > 0));
    const out = [];
    groups.forEach(variants => {
      const hits = [];
      const seen = new Set();
      variants.forEach(v => {
        let from = 0;
        while (from <= text.length) {
          const idx = text.indexOf(v, from);
          if (idx === -1) break;
          hits.push({ start: idx, end: idx + v.length, keyword: v });
          seen.add(v);
          from = idx + v.length;
        }
      });
      if (seen.size >= 2) {
        hits.forEach(h => out.push(buildSpanOccurrence(text, h.start, h.end, h.keyword)));
      }
    });
    return out;
  }

  function detectSameSentenceEnding(text) {
    const sentences = splitSentences(text);
    const endings = sentences.map(s => {
      const trimmed = s.text.replace(/[。．！？!?\n\s]+$/, '');
      const m = trimmed.match(/(でしょう|ました|します|ません|です|ます)$/);
      return m ? m[1] : null;
    });
    const out = [];
    const seen = new Set();
    for (let i = 0; i + 2 < endings.length; i++) {
      if (endings[i] && endings[i] === endings[i + 1] && endings[i + 1] === endings[i + 2]) {
        for (let k = i; k <= i + 2; k++) {
          const key = sentences[k].start + ':' + sentences[k].end;
          if (seen.has(key)) continue;
          seen.add(key);
          const occ = buildSentenceOccurrence(text, sentences[k]);
          if (occ.end > occ.start) out.push(occ);
        }
      }
    }
    return out;
  }

  function detectSameParticle(text) {
    const particles = ['の', 'が', 'を', 'に', 'で', 'と', 'は', 'も'];
    const sentences = splitSentences(text);
    const out = [];
    const seen = new Set();
    sentences.forEach(sent => {
      for (const p of particles) {
        const matches = sent.text.match(new RegExp(p, 'g'));
        if (matches && matches.length >= 3) {
          const key = sent.start + ':' + sent.end;
          if (seen.has(key)) return;
          seen.add(key);
          const occ = buildSentenceOccurrence(text, sent);
          if (occ.end > occ.start) out.push(occ);
          return;
        }
      }
    });
    return out;
  }

  // ====== Heuristic ======
  function detectHeuristic(text, rule) {
    const cat = rule.category || '';
    // 体言止め / 過剰な丁寧語 は pattern で regex 判定
    if (cat === '体言止めのハイライト' || cat === '過剰な丁寧語') {
      return detectRegex(text, rule);
    }
    // 主述関係が不明瞭: sentence_length>=80 を採用
    if (cat === '主述関係が不明瞭') {
      const sentences = splitSentences(text);
      const out = [];
      sentences.forEach(sent => {
        const sLen = sent.text.replace(/\s/g, '').length;
        if (sLen >= 80) {
          const occ = buildSentenceOccurrence(text, sent);
          if (occ.end > occ.start) out.push(occ);
        }
      });
      return out;
    }
    // 未知のヒューリスティック: pattern がregex風なら試行、それ以外はスキップ
    if (rule.pattern && !/(sentence_length|comma_count|same_|alias_groups)/.test(rule.pattern)) {
      return detectRegex(text, rule);
    }
    return [];
  }

  // ====== ディスパッチャ ======
  function checkText(text, rules) {
    const list = rules || cachedRules || [];
    const matched = [];
    const manualList = [];
    let totalCount = 0;
    let matchIdCounter = 0;

    list.forEach(rule => {
      // manual は検出せず、UIリストへ
      if (rule.detectionType === 'manual' || rule.autoDetectable === false) {
        manualList.push(rule);
        return;
      }
      if (!text) return;

      let occurrences = [];
      try {
        switch (rule.detectionType) {
          case 'exact':
          case 'dictionary':
            occurrences = detectExact(text, rule);
            break;
          case 'regex':
            occurrences = detectRegex(text, rule);
            break;
          case 'sentence_metric':
            occurrences = detectSentenceMetric(text, rule);
            break;
          case 'sequence':
            occurrences = detectSequence(text, rule);
            break;
          case 'heuristic':
            occurrences = detectHeuristic(text, rule);
            break;
          default:
            occurrences = [];
        }
      } catch (e) {
        console.warn('[proofreading] detector error (rule ' + rule.id + '):', e);
        occurrences = [];
      }

      if (!occurrences || occurrences.length === 0) return;

      occurrences.sort((a, b) => a.start - b.start);
      occurrences.forEach(occ => {
        matchIdCounter += 1;
        occ.id = 'match-' + String(matchIdCounter).padStart(4, '0');
        occ.ruleId = rule.id;
        occ.detectionType = rule.detectionType;
      });
      totalCount += occurrences.length;
      matched.push({ rule, occurrences });
    });

    return {
      detectionCount: totalCount,
      matched,
      manual: manualList,
      // 旧UI互換: checklist プロパティも維持
      checklist: manualList
    };
  }

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
    groupByCategory,
    _internals: { splitSentences, normalizeRule, parseMetricPattern, evalMetric }
  };
})();
