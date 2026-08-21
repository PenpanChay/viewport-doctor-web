"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { VIEWPORT_PRESETS, DEFAULT_ENABLED_PRESET_IDS } from "@/lib/viewportPresets";

type ViewportEntry = {
  id: string;
  label: string;
  width: number;
  height: number;
  enabled: boolean;
  icon?: string;
  category?: string;
};

type IssueDetails = {
  expected: string;
  actual: string;
  delta: string | null;
  extra?: { label: string; value: string }[];
};

type ScanIssue = {
  check: string;
  message: string;
  selector: string;
  rect: { x: number; y: number; width: number; height: number };
  severity: number | null;
  details: IssueDetails | null;
};

type ScanViewportResult = {
  label: string;
  width: number;
  height: number;
  issues: ScanIssue[];
  screenshot: string;
  cleanScreenshot: string;
  scrollX: number;
  scrollY: number;
  navigationError?: string;
};

type FixSuggestion = {
  check: string;
  selector: string | null;
  message: string;
  elementVaries: boolean;
  brokenViewports: { label: string; width: number; height: number }[];
  okViewports: { label: string; width: number; height: number }[];
  scoped: boolean;
  breakpointHint: string | null;
  suggestion: string;
  fixCode: string;
};

type ScanPage = {
  url: string;
  viewports: ScanViewportResult[];
  fixSuggestions: FixSuggestion[];
};

type ScanResponse = { pages: ScanPage[] } | { error: string };

type BreakpointTransition = {
  selector: string;
  width: number;
  below: number;
  aboveOrEqual: number;
  expected: boolean;
  nearestStandardBreakpoint: { width: number; band: string; dist: number } | null;
};

type BreakpointBand = { label: string; min: number; max: number | null };

type BreakpointResult = {
  url: string;
  minWidth: number;
  maxWidth: number;
  bands: BreakpointBand[];
  transitions: BreakpointTransition[];
};

type BreakpointResponse = BreakpointResult | { error: string };

const DEFAULT_VIEWPORTS: ViewportEntry[] = VIEWPORT_PRESETS.map((p) => ({
  id: p.id,
  label: p.label,
  width: p.width,
  height: p.height,
  icon: p.icon,
  category: p.category,
  enabled: DEFAULT_ENABLED_PRESET_IDS.has(p.id),
}));

// Human-readable label + icon + color per check type, so an issue reads at
// a glance as "horizontal overflow" vs. "overlapping elements" rather than
// a raw identifier. Keyed by the exact strings lib/checks.ts produces.
const CHECK_META: Record<string, { label: string; icon: string; className: string }> = {
  "horizontal-overflow": {
    label: "Horizontal overflow",
    icon: "↔️",
    className: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  },
  "clipped-element": {
    label: "Clipped element",
    icon: "✂️",
    className: "bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
  },
  "overlapping-elements": {
    label: "Overlapping elements",
    icon: "🔀",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  },
  "text-overflow": {
    label: "Text overflow",
    icon: "✏️",
    className: "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-300",
  },
  "oversized-modal": {
    label: "Oversized modal",
    icon: "🗔️",
    className: "bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300",
  },
  "overflowing-image": {
    label: "Overflowing image",
    icon: "🖼️",
    className: "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  },
  "broken-image": {
    label: "Broken image",
    icon: "🚫",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-900/60 dark:text-slate-300",
  },
  "offscreen-element": {
    label: "Off-screen element",
    icon: "📤",
    className: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  },
  "fixed-overlap": {
    label: "Fixed element overlap",
    icon: "🧱",
    className: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
  },
  "tiny-tap-target": {
    label: "Tiny tap target",
    icon: "🤏",
    className: "bg-lime-50 text-lime-700 dark:bg-lime-950/60 dark:text-lime-300",
  },
  "cramped-tap-targets": {
    label: "Cramped tap targets",
    icon: "🫰",
    className: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-300",
  },
  "tiny-text": {
    label: "Tiny text",
    icon: "🔎",
    className: "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
  },
  "low-contrast-text": {
    label: "Low contrast text",
    icon: "🌓",
    className: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
  },
  "distorted-image": {
    label: "Distorted image",
    icon: "📐",
    className: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  },
  "missing-viewport-meta": {
    label: "Missing viewport meta",
    icon: "📵",
    className: "bg-stone-100 text-stone-700 dark:bg-stone-900/60 dark:text-stone-300",
  },
};

function checkMeta(check: string) {
  return (
    CHECK_META[check] ?? {
      label: check,
      icon: "•",
      className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    }
  );
}

function parseLines(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// Playwright storage state (cookies + localStorage) is pasted in as raw
// JSON rather than a username/password, so this app never handles real
// credentials - see the "Storage state" field below and the shared
// lib/resolveStorageState.ts, which re-validates this same JSON server-side
// before it ever reaches a browser context.
function parseStorageStateInput(raw: string): { value?: unknown; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    return { value: JSON.parse(trimmed) };
  } catch {
    return { error: "Storage state must be valid JSON - paste the exported storageState file's contents as-is." };
  }
}

// Zooms into a single issue's flagged element by cropping it out of the
// *clean* (no-overlay) screenshot and drawing only THIS issue's own
// highlight box + badge on top - entirely client-side, so it costs nothing
// extra over the network even when a page has hundreds of issues (see the
// "866 issues" case that motivated this).
//
// Cropping the shared, fully-overlaid `screenshot` instead (the first
// version of this component did) pulls in whichever *other* issues'
// boxes/badges happen to fall inside the padded crop window too - on a
// dense page that's most of them, which read as "other numbers show up
// too". Using `cleanScreenshot` as the source and drawing just this one
// issue's box ourselves guarantees the closeup only ever shows this issue.
//
// `rect` is viewport-relative (Issue.rect, from getBoundingClientRect at
// scan time) while the full-page screenshot is page-absolute, so scrollX/
// scrollY (captured at the same moment, see lib/scanViewport.ts) are added
// back in to land on the same page-absolute pixel the box belongs at.
function IssueCrop({
  cleanScreenshot,
  rect,
  scrollX,
  scrollY,
  badgeNumber,
}: {
  cleanScreenshot: string;
  rect: { x: number; y: number; width: number; height: number };
  scrollX: number;
  scrollY: number;
  badgeNumber: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      setFailed(false);

      // Pad generously around small elements (a 24px button, say) so the
      // crop still reads as a recognizable piece of the page instead of a
      // sliver with a pink box in it and nothing else for context.
      const padX = Math.max(60, rect.width * 0.6);
      const padY = Math.max(60, rect.height * 0.6);

      let sx = rect.x + scrollX - padX;
      let sy = rect.y + scrollY - padY;
      let sw = rect.width + padX * 2;
      let sh = rect.height + padY * 2;

      // Clamp the crop window to the screenshot's actual bounds - reading
      // past the edge of a canvas source image doesn't throw, it just
      // draws blank, which would look like a broken crop rather than
      // "this issue was near the page edge".
      sx = Math.max(0, Math.min(sx, img.naturalWidth - 1));
      sy = Math.max(0, Math.min(sy, img.naturalHeight - 1));
      sw = Math.max(1, Math.min(sw, img.naturalWidth - sx));
      sh = Math.max(1, Math.min(sh, img.naturalHeight - sy));

      canvas.width = Math.round(sw);
      canvas.height = Math.round(sh);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

      // This issue's own box, positioned relative to the crop window -
      // no other issue's rect ever enters this function, so nothing else
      // can get drawn.
      const boxLeft = rect.x + scrollX - sx;
      const boxTop = rect.y + scrollY - sy;
      const boxW = Math.max(rect.width, 2);
      const boxH = Math.max(rect.height, 2);

      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ec4899";
      ctx.strokeRect(boxLeft, boxTop, boxW, boxH);

      const badgeRadius = 11;
      const badgeCx = Math.max(badgeRadius, boxLeft);
      const badgeCy = Math.max(badgeRadius, boxTop);
      ctx.beginPath();
      ctx.arc(badgeCx, badgeCy, badgeRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#ec4899";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(badgeNumber), badgeCx, badgeCy + 1);
    };
    img.onerror = () => {
      if (!cancelled) setFailed(true);
    };
    img.src = cleanScreenshot;

    return () => {
      cancelled = true;
    };
  }, [cleanScreenshot, rect.x, rect.y, rect.width, rect.height, scrollX, scrollY, badgeNumber]);

  if (failed) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-black/[.08] bg-zinc-100 dark:border-white/[.1] dark:bg-zinc-800/60">
      <p className="px-3 pt-2 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
        🔍 Closeup - just this issue, cropped from the clean screenshot
      </p>
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
}

export default function Home() {
  const [baseUrl, setBaseUrl] = useState("");
  const [pagesInput, setPagesInput] = useState("");
  const [storageStateInput, setStorageStateInput] = useState("");
  const [viewports, setViewports] = useState<ViewportEntry[]>(DEFAULT_VIEWPORTS);
  const [customWidth, setCustomWidth] = useState("");
  const [customHeight, setCustomHeight] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingLoginDemo, setLoadingLoginDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanPage[] | null>(null);
  const [activeViewport, setActiveViewport] = useState<Record<string, string>>({});
  const [expandedIssues, setExpandedIssues] = useState<Record<string, boolean>>({});
  const [breakpointState, setBreakpointState] = useState<
    Record<string, { loading: boolean; error: string | null; result: BreakpointResult | null }>
  >({});
  const customFormId = useId();

  function loadDemoExample() {
    setBaseUrl(window.location.origin);
    setPagesInput("/demo\n/demo/edge-cases\n/demo/breakpoint-demo");
    setResult(null);
    setError(null);
  }

  // Logs into the bundled /demo/login page with a real headless browser
  // server-side (see /api/demo-login-storage-state) and drops the resulting
  // storageState straight into the field below, so trying the auth feature
  // never requires a real website's credentials - just this button.
  async function loadLoginDemo() {
    setBaseUrl(window.location.origin);
    setPagesInput("/demo/protected");
    setResult(null);
    setError(null);
    setLoadingLoginDemo(true);
    try {
      const res = await fetch("/api/demo-login-storage-state", { method: "POST" });
      const data = await res.json();
      if (!res.ok || (data && typeof data === "object" && "error" in data)) {
        throw new Error(data?.error ?? `Request failed with status ${res.status}`);
      }
      setStorageStateInput(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingLoginDemo(false);
    }
  }

  function toggleViewport(id: string) {
    setViewports((prev) => prev.map((v) => (v.id === id ? { ...v, enabled: !v.enabled } : v)));
  }

  function removeViewport(id: string) {
    setViewports((prev) => prev.filter((v) => v.id !== id));
  }

  function addCustomViewport() {
    const width = Number(customWidth);
    const height = Number(customHeight);
    if (!width || !height || width <= 0 || height <= 0) return;
    const id = `custom-${Date.now()}`;
    setViewports((prev) => [
      ...prev,
      { id, label: customLabel.trim() || `${width}×${height}`, width, height, enabled: true },
    ]);
    setCustomWidth("");
    setCustomHeight("");
    setCustomLabel("");
  }

  async function runScan() {
    setLoading(true);
    setError(null);
    setResult(null);
    setExpandedIssues({});
    setBreakpointState({});

    try {
      const pages = parseLines(pagesInput);
      if (!baseUrl.trim() || pages.length === 0) {
        throw new Error("Enter a base URL and at least one page path.");
      }
      const activeViewports = viewports.filter((v) => v.enabled);
      if (activeViewports.length === 0) {
        throw new Error("Select at least one viewport to check.");
      }

      const storageState = parseStorageStateInput(storageStateInput);
      if (storageState.error) {
        throw new Error(storageState.error);
      }

      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          pages,
          viewports: activeViewports.map((v) => ({ label: v.label, width: v.width, height: v.height })),
          ...(storageState.value !== undefined ? { storageState: storageState.value } : {}),
        }),
      });

      const data: ScanResponse = await res.json();
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : `Request failed with status ${res.status}`);
      }
      setResult(data.pages);
      // Default each page's selected tab to its first failing viewport, so
      // opening the results immediately shows a problem instead of a
      // clean pass that happens to sort first.
      const defaults: Record<string, string> = {};
      for (const page of data.pages) {
        const firstFailing = page.viewports.find((v) => v.issues.length > 0 || v.navigationError);
        defaults[page.url] = (firstFailing ?? page.viewports[0])?.label ?? "";
      }
      setActiveViewport(defaults);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function runBreakpointDiscovery(pageUrl: string) {
    setBreakpointState((prev) => ({ ...prev, [pageUrl]: { loading: true, error: null, result: null } }));
    try {
      const storageState = parseStorageStateInput(storageStateInput);
      if (storageState.error) {
        throw new Error(storageState.error);
      }

      const res = await fetch("/api/discover-breakpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: pageUrl,
          ...(storageState.value !== undefined ? { storageState: storageState.value } : {}),
        }),
      });
      const data: BreakpointResponse = await res.json();
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : `Request failed with status ${res.status}`);
      }
      setBreakpointState((prev) => ({ ...prev, [pageUrl]: { loading: false, error: null, result: data } }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setBreakpointState((prev) => ({ ...prev, [pageUrl]: { loading: false, error: message, result: null } }));
    }
  }

  const viewportsByCategory = new Map<string, ViewportEntry[]>();
  for (const v of viewports) {
    const key = v.category ?? "Custom";
    if (!viewportsByCategory.has(key)) viewportsByCategory.set(key, []);
    viewportsByCategory.get(key)!.push(v);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white dark:from-black dark:to-zinc-950">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <header className="mb-10 rounded-2xl bg-gradient-to-r from-sky-500 to-emerald-500 p-8 text-white shadow-lg shadow-sky-500/20">
          <h1 className="text-2xl font-semibold">Viewport UI Checker</h1>
          <p className="mt-1 text-sm text-white/85">
            Paste a URL, pick the viewports that matter, and get an automated Responsive UI audit - not just
            screenshots side by side. Every issue comes with the exact numbers behind it and a suggested CSS fix.
          </p>
        </header>

        <section className="mb-10 rounded-xl border border-black/[.08] bg-white p-6 shadow-sm dark:border-white/[.1] dark:bg-zinc-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">1. Paste URL &amp; 2. Select viewports</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={loadDemoExample}
                className="rounded-full border border-black/[.1] px-3 py-1 text-xs font-medium text-zinc-600 transition hover:bg-black/[.04] dark:border-white/[.15] dark:text-zinc-300 dark:hover:bg-white/[.06]"
              >
                Load demo example
              </button>
              <button
                type="button"
                onClick={loadLoginDemo}
                disabled={loadingLoginDemo}
                title="Logs into the bundled /demo/login page for you and fills in the storage state below"
                className="rounded-full border border-black/[.1] px-3 py-1 text-xs font-medium text-zinc-600 transition hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[.15] dark:text-zinc-300 dark:hover:bg-white/[.06]"
              >
                {loadingLoginDemo ? "Logging in…" : "🔑 Try a login-protected demo"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Base URL</span>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:3000"
                className="rounded-lg border border-black/[.1] bg-transparent px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-white/[.15]"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Pages (one per line)</span>
              <textarea
                value={pagesInput}
                onChange={(e) => setPagesInput(e.target.value)}
                placeholder={"/\n/about\n/dashboard"}
                rows={3}
                className="rounded-lg border border-black/[.1] bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-sky-500 dark:border-white/[.15]"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">🔒 Storage state (optional) - for pages behind login</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Log in once in a real browser, export the session as JSON (e.g. via Playwright&apos;s{" "}
                <code className="rounded bg-black/[.06] px-1 py-0.5 dark:bg-white/[.08]">
                  context.storageState()
                </code>
                , or run{" "}
                <code className="rounded bg-black/[.06] px-1 py-0.5 dark:bg-white/[.08]">
                  npx playwright open --save-storage=state.json &lt;login-url&gt;
                </code>{" "}
                and log in), then paste that file&apos;s contents here. Every page above is then scanned already
                signed in - no password is ever sent to this app.
              </span>
              <textarea
                value={storageStateInput}
                onChange={(e) => setStorageStateInput(e.target.value)}
                placeholder='{"cookies": [...], "origins": [...]}'
                rows={3}
                spellCheck={false}
                className="rounded-lg border border-black/[.1] bg-transparent px-3 py-2 font-mono text-xs outline-none focus:border-sky-500 dark:border-white/[.15]"
              />
            </label>

            <div className="flex flex-col gap-3 text-sm">
              <span className="font-medium">Viewports to check</span>
              {Array.from(viewportsByCategory.entries()).map(([category, entries]) => (
                <div key={category} className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    {category}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {entries.map((v) => (
                      <span
                        key={v.id}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
                          v.enabled
                            ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-200"
                            : "border-black/[.1] text-zinc-400 dark:border-white/[.15]"
                        }`}
                      >
                        <label className="flex cursor-pointer items-center gap-1.5">
                          <input type="checkbox" checked={v.enabled} onChange={() => toggleViewport(v.id)} />
                          {v.icon ? <span aria-hidden>{v.icon}</span> : null}
                          {v.label} ({v.width}×{v.height})
                        </label>
                        <button
                          type="button"
                          onClick={() => removeViewport(v.id)}
                          aria-label={`Remove ${v.label} viewport`}
                          className="text-zinc-400 hover:text-rose-500"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <label htmlFor={`${customFormId}-width`} className="sr-only">
                  Custom width
                </label>
                <input
                  id={`${customFormId}-width`}
                  type="number"
                  value={customWidth}
                  onChange={(e) => setCustomWidth(e.target.value)}
                  placeholder="width"
                  className="w-24 rounded-lg border border-black/[.1] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-sky-500 dark:border-white/[.15]"
                />
                <span className="text-zinc-400">×</span>
                <input
                  type="number"
                  value={customHeight}
                  onChange={(e) => setCustomHeight(e.target.value)}
                  placeholder="height"
                  className="w-24 rounded-lg border border-black/[.1] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-sky-500 dark:border-white/[.15]"
                />
                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="label (optional)"
                  className="w-36 rounded-lg border border-black/[.1] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-sky-500 dark:border-white/[.15]"
                />
                <button
                  type="button"
                  onClick={addCustomViewport}
                  className="rounded-full border border-black/[.1] px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-black/[.04] dark:border-white/[.15] dark:text-zinc-300 dark:hover:bg-white/[.06]"
                >
                  + Add custom viewport
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={runScan}
              disabled={loading}
              className="self-start rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Running check…" : "3. Run check"}
            </button>
          </div>
        </section>

        {error && (
          <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {error}
          </div>
        )}

        {result && (
          <section className="mb-6">
            <h2 className="text-lg font-semibold">Results</h2>
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              {(() => {
                const totalIssues = result.reduce(
                  (sum, p) => sum + p.viewports.reduce((s, v) => s + v.issues.length, 0),
                  0
                );
                const pagesWithIssues = result.filter((p) =>
                  p.viewports.some((v) => v.issues.length > 0 || v.navigationError)
                ).length;
                return totalIssues === 0
                  ? `✅ No issues found across ${plural(result.length, "page")} scanned.`
                  : `❌ ${plural(totalIssues, "issue")} found across ${pagesWithIssues} of ${plural(result.length, "page")} scanned.`;
              })()}
            </p>
            <div className="flex flex-col gap-6">
              {result.map((page) => {
                const active = activeViewport[page.url] ?? page.viewports[0]?.label;
                const activeResult = page.viewports.find((v) => v.label === active) ?? page.viewports[0];
                const bp = breakpointState[page.url];
                return (
                  <div
                    key={page.url}
                    className="rounded-xl border border-black/[.08] bg-white p-4 shadow-sm dark:border-white/[.1] dark:bg-zinc-900"
                  >
                    <div className="mb-3 break-all font-mono text-sm font-medium">{page.url}</div>

                    {/* Responsive Health: the "glance" view - one line per
                        viewport, ✓ or ✕ with an issue count, matching the
                        concept's summary card exactly. Clicking a row also
                        selects it as the active viewport below, so there's
                        no separate/duplicate viewport picker. */}
                    <div className="mb-4 overflow-hidden rounded-lg border border-black/[.08] dark:border-white/[.1]">
                      <div className="border-b border-black/[.08] bg-zinc-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-white/[.1] dark:bg-zinc-800/60 dark:text-zinc-400">
                        Responsive Health
                      </div>
                      <ul>
                        {page.viewports.map((v, idx) => {
                          const isActive = v.label === active;
                          const hasIssues = v.issues.length > 0 || v.navigationError;
                          return (
                            <li key={v.label} className={idx > 0 ? "border-t border-black/[.06] dark:border-white/[.08]" : ""}>
                              <button
                                type="button"
                                onClick={() => setActiveViewport((prev) => ({ ...prev, [page.url]: v.label }))}
                                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                                  isActive ? "bg-sky-50 dark:bg-sky-950/40" : "hover:bg-black/[.02] dark:hover:bg-white/[.03]"
                                }`}
                              >
                                <span className="flex items-center gap-2">
                                  <span aria-hidden>{v.navigationError ? "⚠️" : hasIssues ? "✕" : "✓"}</span>
                                  <span className="font-medium">{v.label}</span>
                                  <span className="text-xs text-zinc-400">
                                    {v.width}×{v.height}
                                  </span>
                                </span>
                                <span
                                  className={
                                    v.navigationError
                                      ? "text-xs font-medium text-amber-600 dark:text-amber-400"
                                      : hasIssues
                                        ? "text-xs font-medium text-rose-600 dark:text-rose-400"
                                        : "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                                  }
                                >
                                  {v.navigationError ? "failed to load" : hasIssues ? plural(v.issues.length, "issue") : "clean"}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    {activeResult && (
                      <div className="flex flex-col gap-3">
                        {activeResult.navigationError ? (
                          <p className="text-sm text-rose-600 dark:text-rose-400">
                            Could not load this page at {activeResult.width}×{activeResult.height}:{" "}
                            {activeResult.navigationError}
                          </p>
                        ) : activeResult.issues.length === 0 ? (
                          <p className="text-sm text-emerald-600 dark:text-emerald-400">
                            Clean at {activeResult.width}×{activeResult.height} - nothing to report.
                          </p>
                        ) : (
                          <ul className="flex flex-col gap-3">
                            {activeResult.issues.map((issue, i) => {
                              const meta = checkMeta(issue.check);
                              // Page-level checks (currently just horizontal-overflow
                              // and missing-viewport-meta) can legitimately name a
                              // different element at each viewport, so they're
                              // matched by check alone - see
                              // lib/suggestFixes.ts's PAGE_LEVEL_CHECKS.
                              const fix = page.fixSuggestions?.find(
                                (f) => f.check === issue.check && (f.elementVaries || f.selector === issue.selector)
                              );
                              const reportKey = `${page.url}::${activeResult.label}::${i}`;
                              // First issue open by default per viewport so the
                              // Issue Detail card is visible immediately, without
                              // forcing a click - everything else starts collapsed
                              // to a single scannable line.
                              const open = expandedIssues[reportKey] ?? i === 0;
                              const d = issue.details;
                              return (
                                <li
                                  key={i}
                                  className="rounded-lg border border-black/[.06] text-sm dark:border-white/[.08]"
                                >
                                  <button
                                    type="button"
                                    onClick={() => setExpandedIssues((prev) => ({ ...prev, [reportKey]: !open }))}
                                    aria-expanded={open}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left"
                                  >
                                    <span
                                      title={`Highlighted as #${i + 1} in the screenshot below`}
                                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pink-600 text-[11px] font-bold text-white"
                                    >
                                      {i + 1}
                                    </span>
                                    <span
                                      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}
                                    >
                                      <span aria-hidden>{meta.icon}</span>
                                      {meta.label}
                                    </span>
                                    <span className="flex-1 truncate text-zinc-700 dark:text-zinc-300">
                                      {issue.message}
                                    </span>
                                    <span aria-hidden className="shrink-0 text-zinc-400">
                                      {open ? "▾" : "▸"}
                                    </span>
                                  </button>
                                  {open && (
                                    <div className="flex flex-col gap-2 border-t border-black/[.06] px-3 py-3 dark:border-white/[.08]">
                                      {/* Issue Detail: Viewport / Element /
                                          Expected / Actual / delta, matching
                                          the concept's card exactly, straight
                                          from lib/checks.ts's structured
                                          `details` - not scraped from prose. */}
                                      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
                                        <dt className="font-medium text-zinc-400 dark:text-zinc-500">Viewport</dt>
                                        <dd>
                                          {activeResult.width} × {activeResult.height}
                                        </dd>
                                        <dt className="font-medium text-zinc-400 dark:text-zinc-500">Element</dt>
                                        <dd className="font-mono">{issue.selector}</dd>
                                        {d && (
                                          <>
                                            <dt className="font-medium text-zinc-400 dark:text-zinc-500">Expected</dt>
                                            <dd>{d.expected}</dd>
                                            <dt className="font-medium text-zinc-400 dark:text-zinc-500">Actual</dt>
                                            <dd>{d.actual}</dd>
                                            {d.delta && (
                                              <>
                                                <dt className="font-medium text-zinc-400 dark:text-zinc-500"> </dt>
                                                <dd className="font-medium text-rose-600 dark:text-rose-400">
                                                  {d.delta}
                                                </dd>
                                              </>
                                            )}
                                            {d.extra?.map((e) => (
                                              <Fragment key={e.label}>
                                                <dt className="font-medium text-zinc-400 dark:text-zinc-500">{e.label}</dt>
                                                <dd>{e.value}</dd>
                                              </Fragment>
                                            ))}
                                          </>
                                        )}
                                      </dl>

                                      {activeResult.cleanScreenshot && (
                                        <IssueCrop
                                          cleanScreenshot={activeResult.cleanScreenshot}
                                          rect={issue.rect}
                                          scrollX={activeResult.scrollX}
                                          scrollY={activeResult.scrollY}
                                          badgeNumber={i + 1}
                                        />
                                      )}

                                      {fix && (
                                        <div className="flex flex-col gap-1.5">
                                          <p className="text-xs leading-relaxed text-emerald-800 dark:text-emerald-300">
                                            💡 {fix.suggestion}
                                          </p>
                                          <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
                                            Suggested fix:
                                          </p>
                                          <pre className="overflow-x-auto rounded-md bg-zinc-950 px-3 py-2 text-xs leading-relaxed text-zinc-100">
                                            <code>{fix.fixCode}</code>
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}

                        {activeResult.screenshot && (
                          <>
                            {activeResult.issues.length > 0 && (
                              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                                Full-page screenshot for context - badge numbers match the issue list above. Open an
                                issue above for a closeup of just that one.
                              </p>
                            )}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={activeResult.screenshot}
                              alt={`Screenshot of ${page.url} at ${activeResult.width}x${activeResult.height}, flagged issues highlighted and numbered to match the issue list`}
                              className="w-full rounded-lg border border-black/[.08] dark:border-white/[.1]"
                            />
                          </>
                        )}
                      </div>
                    )}

                    {/* Breakpoint Discovery: an opt-in deeper scan (it sweeps
                        many more widths than the fixed presets above, so it's
                        slower) that finds the ACTUAL width(s) this page's
                        layout changes at, and flags any that land nowhere
                        near a standard breakpoint - the "742px surprise" a
                        handful of preset screenshots can't catch, since none
                        of them happen to straddle it. */}
                    <div className="mt-4 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Breakpoint Discovery</h3>
                        <button
                          type="button"
                          onClick={() => runBreakpointDiscovery(page.url)}
                          disabled={bp?.loading}
                          className="rounded-full border border-black/[.1] px-3 py-1 text-xs font-medium text-zinc-600 transition hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[.15] dark:text-zinc-300 dark:hover:bg-white/[.06]"
                        >
                          {bp?.loading ? "Scanning widths…" : "🔍 Discover breakpoints"}
                        </button>
                      </div>
                      <p className="mb-2 text-xs text-zinc-400 dark:text-zinc-500">
                        Sweeps this page across every width from 320px to 1920px (not just the presets above) to find
                        where its layout actually changes.
                      </p>

                      {bp?.error && (
                        <p className="text-xs text-rose-600 dark:text-rose-400">{bp.error}</p>
                      )}

                      {bp?.result && (
                        <div className="flex flex-col gap-3">
                          {/* Responsive Behavior timeline - the standard bands
                              this tool classifies transitions against. */}
                          <div className="flex flex-wrap gap-1 text-xs">
                            {bp.result.bands.map((band) => (
                              <span
                                key={band.label}
                                className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                              >
                                {band.min}
                                {band.max ? `–${band.max}px` : "px+"} <span className="font-medium">{band.label}</span>
                              </span>
                            ))}
                          </div>

                          {bp.result.transitions.length === 0 ? (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              No repeated-item grid/list found with a column count that changes across this width
                              range - nothing to report.
                            </p>
                          ) : (
                            <ul className="flex flex-col gap-2">
                              {bp.result.transitions.map((t, i) => (
                                <li
                                  key={i}
                                  className={`rounded-lg border px-3 py-2 text-xs ${
                                    t.expected
                                      ? "border-black/[.06] dark:border-white/[.08]"
                                      : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
                                  }`}
                                >
                                  <p className="font-medium">
                                    {t.expected ? "✓" : "⚠"} {t.expected ? "Expected" : "Unexpected"} breakpoint at{" "}
                                    {t.width}px
                                  </p>
                                  <p className="mt-0.5 text-zinc-500 dark:text-zinc-400">
                                    Below {t.width}px: {t.below}-column layout → At/above {t.width}px:{" "}
                                    {t.aboveOrEqual}-column layout
                                  </p>
                                  <p className="mt-0.5 font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
                                    {t.selector}
                                  </p>
                                  {!t.expected && t.nearestStandardBreakpoint && (
                                    <p className="mt-0.5 text-amber-700 dark:text-amber-400">
                                      Nearest standard breakpoint is {t.nearestStandardBreakpoint.width}px (
                                      {t.nearestStandardBreakpoint.band}) - {t.nearestStandardBreakpoint.dist}px away.
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <footer className="mt-12 rounded-xl border border-dashed border-black/[.1] p-4 text-sm text-zinc-500 dark:border-white/[.15]">
          No app to point it at yet? Click <strong>Load demo example</strong>, then <strong>Run check</strong> - the
          bundled <code className="rounded bg-black/[.06] px-1 py-0.5 dark:bg-white/[.08]">/demo</code> page is
          already full of real bugs to try it on, and{" "}
          <code className="rounded bg-black/[.06] px-1 py-0.5 dark:bg-white/[.08]">/demo/breakpoint-demo</code> has a
          real &quot;unexpected breakpoint&quot; for Breakpoint Discovery to find.
        </footer>
      </div>
    </div>
  );
}
