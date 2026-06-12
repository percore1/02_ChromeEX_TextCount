// 文字数カウント — Chrome拡張 sidepanel.js / content.js の除外ロジックを ESモジュール化
// 入力は「貼り付け／入力したプレーンテキスト」または「.docx を mammoth で変換した HTML」。

export type CountResult = {
  hasSelection: boolean;
  countedLength: number;
  originalCount: number;
  excludedCount: number;
  previewText: string;
  rawText: string;
  appliedRules: string[];
  warnings: string[];
  kanjiRatio: number;
};

function injectBlockNewlines(container: HTMLElement) {
  const blockSelectors =
    "p,div,h1,h2,h3,h4,h5,h6,li,blockquote,tr,address,article,section,header,footer,main,nav";
  container.querySelectorAll(blockSelectors).forEach((el) => {
    el.appendChild(document.createTextNode("\n"));
  });
  container.querySelectorAll("br").forEach((el) => {
    el.replaceWith(document.createTextNode("\n"));
  });
}

export function detectTagWarnings(text: string): string[] {
  const warnings: string[] = [];
  const allTagsRe = /[<＜]\s*\/?\s*h([1-6])[^>＞]*[>＞]/gi;
  const allTags = [...text.matchAll(allTagsRe)];

  allTags.forEach((m) => {
    if (/[＜＞]/.test(m[0])) warnings.push(`全角括弧を含む見出しタグ：${m[0]}`);
  });

  const openCount: Record<string, number> = {};
  const closeCount: Record<string, number> = {};
  allTags.forEach((m) => {
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

// URL・SNS等の「ラベル：…」行を1行まるごと除外する対象ラベル
// （例：「URL：https://…」「Instagram：https://…」「公式サイト：…」）
const LINK_LABEL_SRC =
  "^[^\\n]*(URL|ＵＲＬ|リンク|Instagram|インスタグラム|インスタ|Twitter|ツイッター|Facebook|フェイスブック|TikTok|ティックトック|YouTube|ユーチューブ|LINE|note|Threads|スレッズ|Pinterest|ピンタレスト|LinkedIn|HP|ホームページ|公式サイト|公式アカウント)\\s*[：:][^\\n]*";

function linkLabelRegex(): RegExp {
  return new RegExp(LINK_LABEL_SRC, "gim");
}

// 「タイトル：…」等のラベル行（コロン必須なので本文中の語「タイトル」は除外しない）
const TITLE_LABEL_SRC =
  "^[^\\n]*(タイトル|題名|件名|仮タイトル|記事タイトル|本文タイトル)\\s*[：:][^\\n]*";

function titleLabelRegex(): RegExp {
  return new RegExp(TITLE_LABEL_SRC, "gim");
}

// 原稿先頭の「タイトル行」を1行だけ検出する。
// 条件：先頭の最初の非空行で、文末記号(。．！？!?)を含まず、40文字以内、かつ後続に本文がある。
// （単独1行のみの入力はタイトル扱いしない＝カウント0になるのを防ぐ）
function firstLineTitleRange(text: string): { start: number; end: number } | null {
  let i = 0;
  while (i < text.length && (text[i] === "\n" || text[i] === "\r")) i++;
  let lineEnd = i;
  while (lineEnd < text.length && text[lineEnd] !== "\n") lineEnd++;
  const raw = text.slice(i, lineEnd).replace(/\r$/, "");
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 40) return null;
  if (/[。．！？!?]/.test(trimmed)) return null;
  if (!/\S/.test(text.slice(lineEnd))) return null; // 後続に本文が無ければタイトル扱いしない
  return { start: i, end: lineEnd };
}

// テキスト共通の除外ルール（リテラル見出し・引用・リンクラベル・URL・マーカー・価格・タブ）
function applyTextExclusions(text: string, appliedRules: string[]): string {
  // 原稿先頭のタイトル行を除外（原文位置で先に処理）
  const titleRange = firstLineTitleRange(text);
  if (titleRange) {
    text = text.slice(0, titleRange.start) + text.slice(titleRange.end);
    appliedRules.push("先頭のタイトル行を除外");
  }

  const beforeHeadingTag = text;
  text = text.replace(/[<＜]h([1-6])[^>＞]*[>＞][\s\S]*?[<＜]\s*\/h\1[>＞]/gi, "");
  text = text.replace(/[<＜]\s*\/?\s*h[1-6][^>＞]*[>＞]/gi, "");
  if (beforeHeadingTag !== text) appliedRules.push("見出しタグ（文字列）を除外");

  const citationRegex = /^[^\n]*(引用元|参照元|出典元|参考元|引用|参照|出典|参考)\s*[：:][^\n]*/gm;
  const beforeCitation = text;
  text = text.replace(citationRegex, "");
  if (beforeCitation !== text) appliedRules.push("引用元・参照・出典等の行を除外");

  // タイトル等のラベル行（「タイトル：」「題名：」など）を除外
  const beforeTitleLabel = text;
  text = text.replace(titleLabelRegex(), "");
  if (beforeTitleLabel !== text) appliedRules.push("タイトル等のラベル行を除外");

  // URL・SNS等のラベル行（「URL：」「Instagram：」など）を除外
  const beforeLinkLabel = text;
  text = text.replace(linkLabelRegex(), "");
  if (beforeLinkLabel !== text) appliedRules.push("URL・SNS等のラベル行を除外");

  const urlRegex = /(https?:\/\/|www\.)[^ \t\n\r　]*/g;
  const beforeUrl = text;
  text = text.replace(urlRegex, "");
  if (beforeUrl !== text) appliedRules.push("URL を除外");

  const beforeMarker = text;
  text = text.replace(/[・●○►▶※]/g, "");
  text = text.replace(/^\d+[.）)]\s*/gm, "");
  if (beforeMarker !== text) appliedRules.push("リストマーカーを除外");

  const beforePrice = text;
  text = text.replace(/[¥￥]\s*\d[\d,]*(?:\.\d+)?/g, "");
  text = text.replace(/\d[\d,]*(?:\.\d+)?\s*円/g, "");
  if (beforePrice !== text) appliedRules.push("価格表記を除外");

  text = text.replace(/\t/g, "");
  return text;
}

function kanjiRatioOf(text: string): number {
  const orig = text.replace(/\s/g, "").length;
  if (!orig) return 0;
  const kanji = (text.match(/[一-龯㐀-䶿]/g) || []).length;
  return Math.round((kanji / orig) * 100);
}

// 除外箇所の可視化用：原文を「除外/カウント対象」の区間に分解する。
// （applyTextExclusions と同じパターンを原文位置に当てて色分け表示する）
export type ExclSeg = { text: string; excluded: boolean };

export function annotateExclusions(text: string): ExclSeg[] {
  const n = text.length;
  const excl = new Array<boolean>(n).fill(false);
  const mark = (re: RegExp) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      for (let i = m.index; i < m.index + m[0].length; i++) excl[i] = true;
    }
  };
  // 見出しタグ（ペア＋孤立）
  mark(/[<＜]h([1-6])[^>＞]*[>＞][\s\S]*?[<＜]\s*\/h\1[>＞]/gi);
  mark(/[<＜]\s*\/?\s*h[1-6][^>＞]*[>＞]/gi);
  // 先頭のタイトル行
  const tr = firstLineTitleRange(text);
  if (tr) for (let k = tr.start; k < tr.end; k++) excl[k] = true;
  // タイトル等のラベル行（「タイトル：」など）
  mark(titleLabelRegex());
  // 引用・参照行
  mark(/^[^\n]*(引用元|参照元|出典元|参考元|引用|参照|出典|参考)\s*[：:][^\n]*/gm);
  // URL・SNS等のラベル行（「URL：」「Instagram：」など）
  mark(linkLabelRegex());
  // URL
  mark(/(https?:\/\/|www\.)[^ \t\n\r　]*/g);
  // リストマーカー
  mark(/[・●○►▶※]/g);
  mark(/^\d+[.）)]\s*/gm);
  // 価格
  mark(/[¥￥]\s*\d[\d,]*(?:\.\d+)?/g);
  mark(/\d[\d,]*(?:\.\d+)?\s*円/g);

  const segs: ExclSeg[] = [];
  let i = 0;
  while (i < n) {
    const e = excl[i];
    let j = i + 1;
    while (j < n && excl[j] === e) j++;
    segs.push({ text: text.slice(i, j), excluded: e });
    i = j;
  }
  return segs;
}

// プレーンテキスト用（貼り付け・.txt・エディタ入力）
export function processPlainText(text: string): CountResult {
  const rawText = text;
  const originalCount = text.replace(/\s/g, "").length;
  const appliedRules: string[] = [];
  const warnings = detectTagWarnings(text);

  text = applyTextExclusions(text, appliedRules);

  const previewText = text.replace(/\n{3,}/g, "\n\n").trim();
  const countedLength = text.replace(/[ \n\r　]/g, "").length;

  return {
    hasSelection: true,
    countedLength,
    originalCount,
    excludedCount: originalCount - countedLength,
    previewText,
    rawText,
    appliedRules,
    warnings,
    kanjiRatio: kanjiRatioOf(rawText),
  };
}

// HTML 用（.docx を mammoth で変換した結果）— ブラウザ環境専用
export function processHtml(html: string): CountResult {
  const container = document.createElement("div");
  container.innerHTML = html;

  injectBlockNewlines(container);

  const rawText = container.textContent || "";
  const originalCount = rawText.replace(/\s/g, "").length;
  const rawTextForProofreading = rawText;

  const appliedRules: string[] = [];

  const headings = container.querySelectorAll("h1,h2,h3,h4,h5,h6");
  if (headings.length > 0) {
    headings.forEach((el) => el.remove());
    appliedRules.push("h1〜h6 見出しを除外");
  }

  const blockquotes = container.querySelectorAll("blockquote");
  if (blockquotes.length > 0) {
    blockquotes.forEach((el) => el.remove());
    appliedRules.push("blockquote を除外");
  }

  let text = container.textContent || "";

  const warnings = detectTagWarnings(text);
  text = applyTextExclusions(text, appliedRules);

  const previewText = text.replace(/\n{3,}/g, "\n\n").trim();
  const countedLength = text.replace(/[ \n\r　]/g, "").length;

  return {
    hasSelection: true,
    countedLength,
    originalCount,
    excludedCount: originalCount - countedLength,
    previewText,
    rawText: rawTextForProofreading,
    appliedRules,
    warnings,
    kanjiRatio: kanjiRatioOf(rawTextForProofreading),
  };
}
