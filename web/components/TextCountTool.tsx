"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { processPlainText, processHtml, type CountResult } from "@/lib/counting";
import {
  loadRules,
  getLoadError,
  checkText,
  groupByCategory,
  type Rule,
  type Matched,
  type Occurrence,
} from "@/lib/proofreading";

const SAMPLE = `商品の特徴について、当社の製品はとても優れており、他社製品と比較しても非常に高い品質を誇っています。
価格は¥12,800です。詳しくはこちら（https://example.com/items）をご参照ください。
弊社と致しましては、お客様のご要望に対しまして、誠心誠意ご対応させて頂きたく存じます。ご検討の程、何卒よろしくお願い申し上げます。`;

type Feature = "count" | "proofread";

type ToolProps = {
  authEnabled?: boolean;
  userEmail?: string | null;
  initialText?: string;
};

export default function TextCountTool({
  authEnabled = false,
  userEmail = null,
  initialText = "",
}: ToolProps) {
  const [text, setText] = useState(initialText);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [feature, setFeature] = useState<Feature>("count");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [autoCheck, setAutoCheck] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [fileMsg, setFileMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadRules().then((r) => {
      setRules(r);
      const err = getLoadError();
      if (err) setRuleError(String(err.message || err));
    });
  }, []);

  const count: CountResult = useMemo(() => {
    if (!text.trim()) {
      return {
        hasSelection: false,
        countedLength: 0,
        originalCount: 0,
        excludedCount: 0,
        previewText: "",
        rawText: "",
        appliedRules: [],
        warnings: [],
        kanjiRatio: 0,
      };
    }
    return processPlainText(text);
  }, [text]);

  const check = useMemo(() => {
    if (!rules || !autoCheck || !text.trim())
      return { detectionCount: 0, matched: [] as Matched[], manual: [] as Rule[] };
    return checkText(text, rules);
  }, [rules, text, autoCheck]);

  // count-up animation for the hero number
  const animated = useCountUp(count.countedLength);

  // jump to an occurrence: highlight + scroll preview into view
  const jumpTo = useCallback((occ: Occurrence) => {
    setFeature("proofread");
    setActiveId(occ.id || null);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    const el = previewRef.current?.querySelector<HTMLElement>(
      `mark[data-match-id="${activeId}"]`,
    );
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setActiveId(null), 1600);
    return () => clearTimeout(t);
  }, [activeId]);

  const onFile = useCallback(async (file: File) => {
    const name = file.name.toLowerCase();
    setFileMsg(`読み込み中: ${file.name}`);
    try {
      if (name.endsWith(".txt")) {
        const t = await file.text();
        setText(t);
        setFileMsg(`${file.name} を読み込みました`);
      } else if (name.endsWith(".docx")) {
        const arrayBuffer = await file.arrayBuffer();
        // @ts-ignore — browser build has no bundled type declarations
        const mod: any = await import("mammoth/mammoth.browser.js");
        const mammoth = mod.default ?? mod;
        const styleMap = [
          "p[style-name='見出し 1'] => h1:fresh",
          "p[style-name='見出し 2'] => h2:fresh",
          "p[style-name='見出し 3'] => h3:fresh",
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='タイトル'] => h1:fresh",
        ];
        const html = (await mammoth.convertToHtml({ arrayBuffer }, { styleMap }))
          .value as string;
        const r = processHtml(html);
        setText(r.rawText);
        setFileMsg(`${file.name} を読み込みました`);
      } else {
        throw new Error("対応形式は .txt / .docx のみです");
      }
    } catch (e: any) {
      setFileMsg(`エラー: ${e.message || "読み込みに失敗しました"}`);
    }
  }, []);

  const saveHistory = useCallback(async () => {
    if (!text.trim()) return;
    setSaveMsg("保存中…");
    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          counted_length: count.countedLength,
          original_count: count.originalCount,
          excluded_count: count.excludedCount,
          detection_count: check.detectionCount,
          kanji_ratio: count.kanjiRatio,
        }),
      });
      if (!res.ok) throw new Error();
      setSaveMsg("✓ 履歴に保存しました");
    } catch {
      setSaveMsg("保存に失敗しました");
    }
    setTimeout(() => setSaveMsg(null), 2200);
  }, [text, count, check.detectionCount]);

  const hasText = count.hasSelection;

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <div className="seal">朱</div>
          <div>
            <h1>TextCount</h1>
            <div className="sub">EDITORIAL SUITE</div>
          </div>
        </div>
        <button
          className="tb-file"
          style={{ marginLeft: 18 }}
          onClick={() => fileRef.current?.click()}
        >
          <FileIcon />
          ファイルを選択
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.docx"
          hidden
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <span className="tb-stat">
          文字数 <b>{count.countedLength.toLocaleString()}</b>
        </span>
        <span className="tb-stat">
          漢字比率 <b>{count.kanjiRatio}%</b>
        </span>
        <div className="spacer" />
        {authEnabled && userEmail ? (
          <form action="/auth/signout" method="post" className="member-form">
            <div className="member">
              <div>
                <div className="name">{userEmail.split("@")[0]}</div>
                <div className="id">{userEmail}</div>
              </div>
              <div className="avatar">{userEmail.charAt(0).toUpperCase()}</div>
            </div>
            <button className="signout" type="submit" title="ログアウト">
              <SignOutIcon />
            </button>
          </form>
        ) : (
          <div className="member">
            <div>
              <div className="name">ゲスト</div>
              <div className="id">{authEnabled ? "未ログイン" : "認証なし（開発）"}</div>
            </div>
            <div className="avatar">G</div>
          </div>
        )}
      </div>

      <div className="shell">
        {/* LEFT RAIL */}
        <div className="rail">
          <div className="grp">機能</div>
          <button
            className={"nav" + (feature === "count" ? " on" : "")}
            onClick={() => setFeature("count")}
          >
            <CountIcon />
            文字数カウント
          </button>
          <button
            className={"nav" + (feature === "proofread" ? " on" : "")}
            onClick={() => setFeature("proofread")}
          >
            <BrushIcon />
            校閲チェック
          </button>

          {authEnabled && (
            <a className="nav" href="/history">
              <HistoryIcon />
              校閲履歴
            </a>
          )}

          <div className="grp">操作</div>
          <div className="tool" onClick={() => setAutoCheck((v) => !v)}>
            自動チェック
            <span className={"switch" + (autoCheck ? "" : " off")} />
          </div>
          {authEnabled && (
            <button className="tool" onClick={saveHistory} disabled={!hasText}>
              <SaveIcon />
              履歴に保存
            </button>
          )}
          <button className="tool" onClick={() => setText("")}>
            <ResetIcon />
            テキストをリセット
          </button>
          <button
            className="tool"
            onClick={() => navigator.clipboard?.writeText(count.previewText)}
          >
            <CopyIcon />
            除外後をコピー
          </button>
          {saveMsg && <div className="save-msg">{saveMsg}</div>}
        </div>

        {/* CENTER */}
        <div className="center">
          <div className="doc-head">
            <span className="h">
              <span className="dotline" />
              原稿
            </span>
            <span className="ratio">
              漢字比率 <b>{count.kanjiRatio}%</b>
            </span>
          </div>

          <div className="editor">
            <div className="editor-bar">
              <span className="tagi">
                <BoxIcon />
                テキストボックス（貼り付け／入力）
              </span>
              <div className="ebtn">
                <button onClick={() => setText(SAMPLE)}>サンプル挿入</button>
                <button onClick={() => setText("")}>クリア</button>
              </div>
            </div>
            <textarea
              className="ed-area"
              spellCheck={false}
              placeholder="ここに原稿を貼り付け、または入力してください。"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {fileMsg && (
            <div className="note">
              <b>ファイル：</b>
              {fileMsg}
            </div>
          )}

          {/* highlighted preview (校閲対象テキスト) */}
          {feature === "proofread" && hasText && check.matched.length > 0 && (
            <div className="preview-wrap">
              <div className="preview-head">校閲対象テキスト（クリックで該当箇所へ）</div>
              <div className="preview-body" ref={previewRef}>
                {buildHighlightNodes(text, check.matched, jumpTo)}
              </div>
            </div>
          )}

          {!hasText && (
            <div className="guide">
              <div className="step">
                <div className="no">1</div>
                <h5>原稿を貼る</h5>
                <p>テキストボックスに貼り付け・入力。打つそばから文字数が動きます。</p>
              </div>
              <div className="step">
                <div className="no">2</div>
                <h5>自動で数える</h5>
                <p>見出し・URL・価格・引用は自動で除外。実質の本文量がひと目で。</p>
              </div>
              <div className="step">
                <div className="no">3</div>
                <h5>朱を入れる</h5>
                <p>気になる箇所に赤線。クリックで該当位置までジャンプします。</p>
              </div>
            </div>
          )}

          <div className="note">
            <span>
              <span className="sw" style={{ background: "var(--shu)" }} />
              <b>朱の下線</b>＝語句の指摘
              <span
                className="sw"
                style={{
                  background: "var(--shu-wash)",
                  border: "1px solid var(--line-2)",
                }}
              />
              <b>朱マーカー</b>＝文の指摘　— すべてブラウザ内で処理し、原稿はサーバーに送信しません。
            </span>
          </div>
        </div>

        {/* RIGHT RESULTS */}
        <div className="results">
          <div className="count-card">
            <span className="cap">カウント対象文字数</span>
            <div className="bignum">
              <span className="n" key={count.countedLength}>
                {animated.toLocaleString()}
              </span>
              <span className="u">文字</span>
            </div>
            <div className="delta">&nbsp;</div>
            <div className="meter">
              <i
                style={{
                  width: Math.min(100, Math.round((count.countedLength / 600) * 100)) + "%",
                }}
              />
            </div>
            <div className="mini">
              <div className="box">
                <div className="k">元文字数</div>
                <div className="v">
                  {count.originalCount.toLocaleString()}
                  <small>字</small>
                </div>
              </div>
              <div className="box">
                <div className="k">除外文字数</div>
                <div className="v" style={{ color: "var(--shu-deep)" }}>
                  {count.excludedCount.toLocaleString()}
                  <small>字</small>
                </div>
              </div>
            </div>
          </div>

          {feature === "count" ? (
            <CountDetails count={count} />
          ) : (
            <ProofResults
              check={check}
              ruleError={ruleError}
              hasText={hasText}
              activeId={activeId}
              onJump={jumpTo}
              showManual={showManual}
              setShowManual={setShowManual}
            />
          )}
        </div>
      </div>
    </>
  );
}

/* ---------- count details (適用ルール・警告) ---------- */
function CountDetails({ count }: { count: CountResult }) {
  return (
    <div className="rules-section">
      <div className="st">適用した除外ルール</div>
      <ul>
        <li>スペース・改行・タブを除外</li>
        {count.appliedRules.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      {count.warnings.length > 0 && (
        <>
          <div className="st">⚠ 要確認項目</div>
          <ul className="warn-list">
            {count.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ---------- proof results ---------- */
function ProofResults({
  check,
  ruleError,
  hasText,
  activeId,
  onJump,
  showManual,
  setShowManual,
}: {
  check: { detectionCount: number; matched: Matched[]; manual: Rule[] };
  ruleError: string | null;
  hasText: boolean;
  activeId: string | null;
  onJump: (o: Occurrence) => void;
  showManual: boolean;
  setShowManual: (v: boolean) => void;
}) {
  const groups = groupByCategory(check.matched, (m) => m.rule.category);
  const manualGroups = groupByCategory(check.manual, (r) => r.category);

  return (
    <>
      <div className="rzhead">
        <BrushIcon className="brush" />
        <span className="t">校閲チェック</span>
        <span className={"badge-count" + (check.detectionCount ? "" : " zero")}>
          {check.detectionCount}
        </span>
      </div>

      {ruleError && (
        <div className="empty" style={{ borderColor: "var(--shu)", color: "var(--shu-deep)" }}>
          ルール読み込みエラー: {ruleError}
        </div>
      )}

      {!hasText && <div className="empty">原稿を入力すると校閲結果が表示されます</div>}

      {hasText && check.matched.length === 0 && !ruleError && (
        <div className="empty">検出された項目はありません</div>
      )}

      {groups.map((g) => (
        <div className="cat" key={g.category}>
          <div className="cat-t">{g.category}</div>
          {g.items.map((item) => (
            <RuleCard
              key={item.rule.id}
              rule={item.rule}
              occurrences={item.occurrences}
              activeId={activeId}
              onJump={onJump}
            />
          ))}
        </div>
      ))}

      {check.manual.length > 0 && (
        <div className={"collapse" + (showManual ? " open" : "")}>
          <div className="ch" onClick={() => setShowManual(!showManual)}>
            自動検出対象外の確認項目（手動チェック）
            <span className="cnt">{check.manual.length}</span>
            <span className="ico">▶</span>
          </div>
          {showManual && (
            <div className="cbody">
              {manualGroups.map((g) => (
                <div className="cat" key={g.category}>
                  <div className="cat-t">{g.category}</div>
                  {g.items.map((r) => (
                    <div className="rule" key={r.id} style={{ cursor: "default" }}>
                      <div className="rh">
                        <span className="rt">{r.title}</span>
                      </div>
                      {r.description && <div className="desc">{r.description}</div>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function RuleCard({
  rule,
  occurrences,
  activeId,
  onJump,
}: {
  rule: Rule;
  occurrences: Occurrence[];
  activeId: string | null;
  onJump: (o: Occurrence) => void;
}) {
  const sevCls =
    rule.severity === "error" || rule.severity === "warn" || rule.severity === "warning"
      ? "warn"
      : "";
  return (
    <div className="rule">
      <div className="rh">
        <span className={"sev " + sevCls}>{rule.severity.toUpperCase()}</span>
        {rule.sourceTab && <span className="src-tab">{rule.sourceTab}</span>}
        <span className="rt">{rule.title}</span>
        <span className="occ">{occurrences.length}件</span>
      </div>
      {occurrences.length > 0 && (
        <div className="matches">
          {occurrences.slice(0, 12).map((occ, i) => {
            const label =
              occ.kind === "sentence"
                ? occ.text.length > 18
                  ? occ.text.slice(0, 18) + "…"
                  : occ.text
                : occ.text;
            return (
              <span
                key={occ.id || i}
                className="chiptag"
                title={(occ.before || "") + "【" + occ.text + "】" + (occ.after || "")}
                style={
                  activeId && occ.id === activeId
                    ? { outline: "2px solid var(--shu)" }
                    : undefined
                }
                onClick={() => onJump(occ)}
              >
                {label} #{i + 1}
              </span>
            );
          })}
        </div>
      )}
      {rule.recommended && (
        <div className="rec">
          改善案：<b>{rule.recommended}</b>
        </div>
      )}
      {rule.message && rule.message !== rule.recommended && (
        <div className="rec">{rule.message}</div>
      )}
      {rule.description && <div className="desc">{rule.description}</div>}
    </div>
  );
}

/* ---------- highlight builder (sentence outer / span inner) ---------- */
function buildHighlightNodes(
  text: string,
  matched: Matched[],
  onJump: (o: Occurrence) => void,
): React.ReactNode[] {
  const all: Occurrence[] = [];
  matched.forEach((m) => m.occurrences.forEach((o) => all.push(o)));

  const sentenceAt: (Occurrence | null)[] = new Array(text.length + 1).fill(null);
  const spanAt: (Occurrence | null)[] = new Array(text.length + 1).fill(null);

  const sentenceOccs = all.filter((o) => o.kind === "sentence");
  sentenceOccs.sort((a, b) => a.end - a.start - (b.end - b.start));
  sentenceOccs.forEach((o) => {
    for (let i = o.start; i < o.end; i++) if (!sentenceAt[i]) sentenceAt[i] = o;
  });

  const spanOccs = all.filter((o) => o.kind !== "sentence");
  spanOccs.sort((a, b) => a.start - b.start || b.end - a.end);
  spanOccs.forEach((o) => {
    for (let i = o.start; i < o.end; i++) if (!spanAt[i]) spanAt[i] = o;
  });

  const nodes: React.ReactNode[] = [];
  let pos = 0;
  let key = 0;
  while (pos < text.length) {
    const curSent = sentenceAt[pos];
    const curSpan = spanAt[pos];
    let end = pos + 1;
    while (end < text.length && sentenceAt[end] === curSent && spanAt[end] === curSpan) end++;
    const seg = text.slice(pos, end);

    let node: React.ReactNode = seg;
    if (curSpan) {
      node = (
        <mark
          key={"s" + key}
          className="shu"
          data-match-id={curSpan.id}
          onClick={(e) => {
            e.stopPropagation();
            onJump(curSpan);
          }}
        >
          {node}
        </mark>
      );
    }
    if (curSent) {
      node = (
        <mark
          key={"t" + key}
          className="sentence"
          data-match-id={curSent.id}
          onClick={() => onJump(curSent)}
        >
          {node}
        </mark>
      );
    }
    nodes.push(<React.Fragment key={key}>{node}</React.Fragment>);
    pos = end;
    key++;
  }
  return nodes;
}

/* ---------- count-up hook ---------- */
function useCountUp(target: number) {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    const to = target;
    if (from === to) return;
    const dur = 420;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (to - from) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return val;
}

/* ---------- icons ---------- */
function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M14 3v5h5M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    </svg>
  );
}
function CountIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 7V5h16v2M9 20h6M12 5v15" />
    </svg>
  );
}
function BrushIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 20c2-1 3-3 5-7s4-7 8-9"
        stroke="#D6402F"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <path d="M15 5c2 .5 3 2 4 4" stroke="#B5301F" strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  );
}
function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}
function BoxIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9A9A9A" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
    </svg>
  );
}
function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 12a9 9 0 1 0 2-5.6M3 4v3h3M12 8v4l3 2" />
    </svg>
  );
}
function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8" />
    </svg>
  );
}
function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="15" height="15">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}
