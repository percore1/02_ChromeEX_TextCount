// 校閲チェックエンジン（detector ディスパッチャ）— Chrome拡張 proofreading.js を ESモジュール化
// 入力データ: /public/data/text_checklist.json
// 対応 detection_type: exact / dictionary / regex / sentence_metric / sequence / heuristic / manual
// URL は検出対象から除外する（位置情報は保持、原文表示は維持）

const RULES_URL = "/data/text_checklist.json";
const CUSTOM_RULES_URL = "/api/rules";

export type Occurrence = {
  kind: "span" | "sentence";
  keyword: string;
  start: number;
  end: number;
  text: string;
  before: string;
  after: string;
  id?: string;
  ruleId?: string;
  detectionType?: string;
};

export type Rule = {
  id: string;
  ruleType: string;
  sourceTab: string;
  detectionType: string;
  autoDetectable: boolean;
  category: string;
  severity: string;
  title: string;
  description: string;
  message: string;
  basicComment: string;
  recommended: string;
  examples: string;
  implementationNote: string;
  keyword: string;
  keywords: string[];
  pattern: string;
  type: string;
};

export type Matched = { rule: Rule; occurrences: Occurrence[] };
export type CheckResult = {
  detectionCount: number;
  matched: Matched[];
  manual: Rule[];
};

let cachedRules: Rule[] | null = null;
let loadPromise: Promise<Rule[]> | null = null;
let loadError: Error | null = null;

export function loadRules(): Promise<Rule[]> {
  if (cachedRules) return Promise.resolve(cachedRules);
  if (loadPromise) return loadPromise;

  const staticP = fetch(RULES_URL)
    .then((res) => {
      if (!res.ok) throw new Error("rules fetch failed: " + res.status);
      return res.json();
    })
    .then((r) => (Array.isArray(r) ? r : []));

  // カスタムルール（ログイン時のみ取得。失敗・未ログインは空でフォールバック）
  const customP = fetch(CUSTOM_RULES_URL)
    .then((res) => (res.ok ? res.json() : { rules: [] }))
    .then((j) => (Array.isArray(j?.rules) ? j.rules : []))
    .catch(() => []);

  loadPromise = Promise.all([staticP, customP])
    .then(([staticRules, customRules]) => {
      const all = [...staticRules, ...customRules];
      cachedRules = all
        .filter((r: any) => r && r.enabled !== false)
        .map(normalizeRule);
      loadError = null;
      return cachedRules;
    })
    .catch((err) => {
      loadError = err;
      cachedRules = [];
      return cachedRules;
    });

  return loadPromise;
}

export function getLoadError(): Error | null {
  return loadError;
}

function normalizeRule(raw: any): Rule {
  const keywords = splitKeyword(raw.keyword);
  const sev = (raw.severity || "info").toLowerCase();
  const detType = (
    raw.detection_type || (raw.recommended_word ? "exact" : "manual")
  ).toLowerCase();
  return {
    id: String(raw.id),
    ruleType: raw.rule_type || "",
    sourceTab: raw.source_tab || "",
    detectionType: detType,
    autoDetectable: raw.auto_detectable !== false,
    category: raw.category || "(未分類)",
    severity: sev,
    title: raw.check_item || raw.title || "rule-" + raw.id,
    description: raw.explanation || raw.description || "",
    message: raw.message || raw.basic_comment_preview || "",
    basicComment: raw.basic_comment_preview || raw.basic_comment || "",
    recommended: raw.recommended_word || raw.replacement || "",
    examples: raw.examples || "",
    implementationNote: raw.implementation_note || "",
    keyword: raw.keyword || "",
    keywords,
    pattern: raw.pattern || "",
    type:
      detType === "manual"
        ? "checklist"
        : raw.recommended_word
          ? "replacement"
          : "keyword",
  };
}

function splitKeyword(kw: any): string[] {
  if (!kw || typeof kw !== "string") return [];
  return kw
    .split(/[;；]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ====== URL マスキング ======
function maskUrls(text: string): string {
  if (!text) return "";
  const URL_REGEX = /(https?:\/\/|www\.)[^\s　]+/g;
  let masked = "";
  let lastEnd = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_REGEX.exec(text)) !== null) {
    masked += text.slice(lastEnd, m.index);
    masked += " ".repeat(m[0].length);
    lastEnd = m.index + m[0].length;
  }
  masked += text.slice(lastEnd);
  return masked;
}

// ====== 文分割 ======
function splitSentences(text: string) {
  if (!text) return [];
  const sentences: { start: number; end: number; text: string }[] = [];
  let buf = "";
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    buf += ch;
    const isDelim = /[。．！？!?]/.test(ch) || ch === "\n";
    if (isDelim) {
      if (buf.trim().length > 0) sentences.push({ start, end: i + 1, text: buf });
      start = i + 1;
      buf = "";
    }
  }
  if (buf.trim().length > 0) sentences.push({ start, end: text.length, text: buf });
  return sentences;
}

const CONTEXT_LEN = 20;

function buildSpanOccurrence(
  originalText: string,
  start: number,
  end: number,
  keyword: string,
): Occurrence {
  return {
    kind: "span",
    keyword,
    start,
    end,
    text: originalText.slice(start, end),
    before: originalText.slice(Math.max(0, start - CONTEXT_LEN), start),
    after: originalText.slice(end, end + CONTEXT_LEN),
  };
}

function buildSentenceOccurrence(
  originalText: string,
  sentence: { start: number; end: number; text: string },
): Occurrence {
  let s = sentence.start;
  let e = sentence.end;
  while (s < e && /\s/.test(originalText[s])) s += 1;
  while (e > s && /\s/.test(originalText[e - 1])) e -= 1;
  const sentText = originalText.slice(s, e);
  const prefix = sentText.replace(/\s+/g, "").slice(0, 25);
  return {
    kind: "sentence",
    keyword: prefix || sentText.slice(0, 20),
    start: s,
    end: e,
    text: sentText,
    before: "",
    after: "",
  };
}

// ====== Detectors ======
function detectExact(text: string, rule: Rule, originalText: string): Occurrence[] {
  const out: Occurrence[] = [];
  rule.keywords.forEach((kw) => {
    if (!kw) return;
    let from = 0;
    while (from <= text.length) {
      const idx = text.indexOf(kw, from);
      if (idx === -1) break;
      out.push(buildSpanOccurrence(originalText, idx, idx + kw.length, kw));
      from = idx + kw.length;
    }
  });
  return out;
}

function detectRegex(text: string, rule: Rule, originalText: string): Occurrence[] {
  if (!rule.pattern) return [];
  let re: RegExp;
  try {
    re = new RegExp(rule.pattern, "gu");
  } catch (e: any) {
    console.warn("[proofreading] invalid regex (rule " + rule.id + "):", e.message);
    return [];
  }
  const out: Occurrence[] = [];
  let m: RegExpExecArray | null;
  let safety = 0;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const matchLen = (m[0] || "").length;
    const end = start + matchLen;
    if (matchLen > 0 && end <= text.length) {
      out.push(buildSpanOccurrence(originalText, start, end, m[0]));
    } else {
      re.lastIndex = start + 1;
    }
    if (++safety > 20000) break;
  }
  return out;
}

function parseMetricPattern(pattern: string) {
  if (!pattern) return null;
  const tokens = pattern.split(/\s+AND\s+/i).map((s) => s.trim());
  const conds: { key: string; op: string; val: number }[] = [];
  for (const tok of tokens) {
    const m = tok.match(/^(sentence_length|comma_count)\s*(>=|<=|==|>|<)\s*(\d+)$/);
    if (!m) return null;
    conds.push({ key: m[1], op: m[2], val: parseInt(m[3], 10) });
  }
  return conds;
}

function evalMetric(
  conds: { key: string; op: string; val: number }[],
  sLen: number,
  cCount: number,
): boolean {
  for (const c of conds) {
    const v = c.key === "sentence_length" ? sLen : cCount;
    if (c.op === ">=" && !(v >= c.val)) return false;
    if (c.op === "<=" && !(v <= c.val)) return false;
    if (c.op === "==" && !(v === c.val)) return false;
    if (c.op === ">" && !(v > c.val)) return false;
    if (c.op === "<" && !(v < c.val)) return false;
  }
  return true;
}

function detectSentenceMetric(text: string, rule: Rule, originalText: string): Occurrence[] {
  const conds = parseMetricPattern(rule.pattern);
  if (!conds) return [];
  const sentences = splitSentences(text);
  const out: Occurrence[] = [];
  sentences.forEach((sent) => {
    const inner = sent.text;
    const sLen = inner.replace(/\s/g, "").length;
    const cCount = (inner.match(/[、，]/g) || []).length;
    if (evalMetric(conds, sLen, cCount)) {
      const occ = buildSentenceOccurrence(originalText, sent);
      if (occ.end > occ.start) out.push(occ);
    }
  });
  return out;
}

function detectSequence(text: string, rule: Rule, originalText: string): Occurrence[] {
  const p = rule.pattern || "";
  if (/alias_groups/i.test(p)) return detectAliasGroups(text, p, originalText);
  if (/same_sentence_ending/i.test(p)) return detectSameSentenceEnding(text, originalText);
  if (/same_particle/i.test(p)) return detectSameParticle(text, originalText);
  return [];
}

function detectAliasGroups(text: string, pattern: string, originalText: string): Occurrence[] {
  const m = pattern.match(/alias_groups\s*:\s*(.+)$/i);
  if (!m) return [];
  const groups = m[1]
    .split("|")
    .map((g) => g.split("/").map((s) => s.trim()).filter((s) => s.length > 0));
  const out: Occurrence[] = [];
  groups.forEach((variants) => {
    const hits: { start: number; end: number; keyword: string }[] = [];
    const seen = new Set<string>();
    variants.forEach((v) => {
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
      hits.forEach((h) => out.push(buildSpanOccurrence(originalText, h.start, h.end, h.keyword)));
    }
  });
  return out;
}

function detectSameSentenceEnding(text: string, originalText: string): Occurrence[] {
  const sentences = splitSentences(text);
  const endings = sentences.map((s) => {
    const trimmed = s.text.replace(/[。．！？!?\n\s]+$/, "");
    const m = trimmed.match(/(でしょう|ました|します|ません|です|ます)$/);
    return m ? m[1] : null;
  });
  const out: Occurrence[] = [];
  const seen = new Set<string>();
  for (let i = 0; i + 2 < endings.length; i++) {
    if (endings[i] && endings[i] === endings[i + 1] && endings[i + 1] === endings[i + 2]) {
      for (let k = i; k <= i + 2; k++) {
        const key = sentences[k].start + ":" + sentences[k].end;
        if (seen.has(key)) continue;
        seen.add(key);
        const occ = buildSentenceOccurrence(originalText, sentences[k]);
        if (occ.end > occ.start) out.push(occ);
      }
    }
  }
  return out;
}

function detectSameParticle(text: string, originalText: string): Occurrence[] {
  const particles = ["の", "が", "を", "に", "で", "と", "は", "も"];
  const sentences = splitSentences(text);
  const out: Occurrence[] = [];
  const seen = new Set<string>();
  sentences.forEach((sent) => {
    for (const p of particles) {
      const matches = sent.text.match(new RegExp(p, "g"));
      if (matches && matches.length >= 3) {
        const key = sent.start + ":" + sent.end;
        if (seen.has(key)) return;
        seen.add(key);
        const occ = buildSentenceOccurrence(originalText, sent);
        if (occ.end > occ.start) out.push(occ);
        return;
      }
    }
  });
  return out;
}

function detectHeuristic(text: string, rule: Rule, originalText: string): Occurrence[] {
  const cat = rule.category || "";
  if (cat === "体言止めのハイライト" || cat === "過剰な丁寧語") {
    return detectRegex(text, rule, originalText);
  }
  if (cat === "主述関係が不明瞭") {
    const sentences = splitSentences(text);
    const out: Occurrence[] = [];
    sentences.forEach((sent) => {
      const sLen = sent.text.replace(/\s/g, "").length;
      if (sLen >= 80) {
        const occ = buildSentenceOccurrence(originalText, sent);
        if (occ.end > occ.start) out.push(occ);
      }
    });
    return out;
  }
  if (rule.pattern && !/(sentence_length|comma_count|same_|alias_groups)/.test(rule.pattern)) {
    return detectRegex(text, rule, originalText);
  }
  return [];
}

// ====== ディスパッチャ ======
export function checkText(text: string, rules?: Rule[]): CheckResult {
  const list = rules || cachedRules || [];
  const matched: Matched[] = [];
  const manualList: Rule[] = [];
  let totalCount = 0;
  let matchIdCounter = 0;

  const originalText = text || "";
  const detectionText = maskUrls(originalText);

  list.forEach((rule) => {
    if (rule.detectionType === "manual" || rule.autoDetectable === false) {
      manualList.push(rule);
      return;
    }
    if (!detectionText) return;

    let occurrences: Occurrence[] = [];
    try {
      switch (rule.detectionType) {
        case "exact":
        case "dictionary":
          occurrences = detectExact(detectionText, rule, originalText);
          break;
        case "regex":
          occurrences = detectRegex(detectionText, rule, originalText);
          break;
        case "sentence_metric":
          occurrences = detectSentenceMetric(detectionText, rule, originalText);
          break;
        case "sequence":
          occurrences = detectSequence(detectionText, rule, originalText);
          break;
        case "heuristic":
          occurrences = detectHeuristic(detectionText, rule, originalText);
          break;
        default:
          occurrences = [];
      }
    } catch (e) {
      console.warn("[proofreading] detector error (rule " + rule.id + "):", e);
      occurrences = [];
    }

    if (!occurrences || occurrences.length === 0) return;

    occurrences.sort((a, b) => a.start - b.start);
    occurrences.forEach((occ) => {
      matchIdCounter += 1;
      occ.id = "match-" + String(matchIdCounter).padStart(4, "0");
      occ.ruleId = rule.id;
      occ.detectionType = rule.detectionType;
    });
    totalCount += occurrences.length;
    matched.push({ rule, occurrences });
  });

  return { detectionCount: totalCount, matched, manual: manualList };
}

export function groupByCategory<T>(items: T[], getCategory: (item: T) => string) {
  const map = new Map<string, T[]>();
  items.forEach((item) => {
    const cat = getCategory(item) || "(未分類)";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(item);
  });
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
}
