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

// テキスト共通の除外ルール（リテラル見出し・引用・URL・マーカー・価格・タブ）
function applyTextExclusions(text: string, appliedRules: string[]): string {
  const beforeHeadingTag = text;
  text = text.replace(/[<＜]h([1-6])[^>＞]*[>＞][\s\S]*?[<＜]\s*\/h\1[>＞]/gi, "");
  text = text.replace(/[<＜]\s*\/?\s*h[1-6][^>＞]*[>＞]/gi, "");
  if (beforeHeadingTag !== text) appliedRules.push("見出しタグ（文字列）を除外");

  const citationRegex = /^[^\n]*(引用元|参照元|出典元|参考元|引用|参照|出典|参考)\s*[：:][^\n]*/gm;
  const beforeCitation = text;
  text = text.replace(citationRegex, "");
  if (beforeCitation !== text) appliedRules.push("引用元・参照・出典等の行を除外");

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
