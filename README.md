# Viewport Doctor

A Next.js app that opens your pages in a real headless browser at several
screen sizes and flags responsive-layout bugs — horizontal scrolling,
clipped buttons, overlapping elements, text overflow, oversized modals,
images wider than their container, elements pushed off-screen, and
content hidden under a fixed header/nav. Each issue comes with a
highlighted, numbered screenshot, the exact element to fix, and a plain-
language explanation of what's wrong and how to fix it — cross-checked
against every viewport you scanned so a fix for mobile doesn't silently
break desktop.

## Quickstart

```bash
git clone <this-repo-url>
cd viewport-doctor-web
npm install        # also downloads Playwright's bundled Chromium (~150MB, one-off)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click **Load demo
example**, then **Run scan** — the bundled `/demo` page ships inside this
same project, so there's nothing else to set up. No environment
variables or API keys are required (see `.env.example`).

`/demo` is deliberately kept to 2 easy-to-read bugs (fewer than 5 issues
reported at any viewport) so a first scan reads clearly; the other 5
checks the tool supports are demonstrated at `/demo/edge-cases` instead
(see "The eight checks" below).

**Requirements:** Node.js 20+ and npm.

### Scan your own app

Start your app's dev server, then in the form enter a **Base URL** (e.g.
`http://localhost:3000`), one or more **Pages** (`/`, `/about`, ...), and
pick the viewports to check. Click **Run scan**. Results are grouped per
page with a pill per viewport (✅ clean, ❌ N issues, ⚠️ failed to load) —
each issue names the element to fix and explains, in plain language,
what's wrong and how to fix it. The dashboard keeps this to prose on
purpose — no CSS snippet to copy-paste blind; see "Suggested fixes"
below for where the underlying CSS still lives if you want it.

## The eight checks

All eight are real DOM geometry checks (`getBoundingClientRect`/
`scrollWidth`, no pixel-diffing) — if one fires, the measured issue is real.

| Check | What it catches |
|---|---|
| `horizontal-overflow` | Page is wider than the viewport — reports up to 3 of the most specific elements responsible. |
| `clipped-element` | A button/link/input cut off by an ancestor with `overflow: hidden`. |
| `overlapping-elements` | Two interactive elements overlap by more than 30% of the smaller one's area. |
| `text-overflow` | Text wider than its box, with no wrap/ellipsis handling. |
| `oversized-modal` | A `<dialog>`/`[role="dialog"]`/`.modal`-ish element bigger than the viewport. |
| `overflowing-image` | An `<img>` wider than its parent container. |
| `offscreen-element` | An explicitly-positioned interactive element pushed past the viewport edge. |
| `fixed-overlap` | A `position: fixed`/`sticky` bar covering more than 30% of the content beneath it. |

## Suggested fixes

Every issue gets a rule-based (not LLM) suggestion from `lib/suggestFixes.js`:
a plain-language fix per check type, plus a scoping note — "broken at
every viewport" (safe to fix globally) vs. "broken only at some
viewports" (scope the fix, e.g. a `max-width` media query, so sizes that
already pass keep passing). The dashboard shows this prose plus the
exact element it applies to; it doesn't surface a raw CSS snippet, since
a generic template pasted in blind can silently break a viewport that
was already passing. Behind that prose, `suggestFixes.js` still computes
a `fixCode` CSS snippet targeting the real selector the scan found —
already wrapped in the matching `@media` query when the fix needs to be
scoped, and already escaped for Tailwind-style arbitrary-value class
names (`w-\[320px\]`) — the API returns it in every `fixSuggestions`
entry (see "API reference" below) for anyone building their own UI on
top of this, or feeding it into `/api/preview-fix`.

### Verifying a fix before you paste it

`POST /api/preview-fix` (backed by `lib/previewFix.js`) closes the loop:
give it a page, a viewport, and a CSS snippet (normally a `fixCode` value
verbatim), and it measures the issue, injects that exact CSS into a
fresh headless-browser load of the real page, re-measures, and reports
`resolved` / `improved` / `unresolved` / `worse` / `unknown` with the
before/after severity. Nothing is written back to your source or
persisted — the browser context is discarded once the check finishes.
This isn't wired into the dashboard as a button today, but it's a real,
tested endpoint — call it directly, or use it as the base for your own
"verify" button. See the API reference below.

> This tool detects issues and suggests fixes — it does not modify your
> source code. Mapping a flagged DOM element back to the source file/line
> that rendered it, and safely patching it, is a meaningfully larger,
> separate project layered on top of this one.

## API reference

### `POST /api/scan`

```bash
curl -s -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "http://localhost:3000",
    "pages": ["/", "/about"],
    "viewports": [
      { "label": "Mobile", "width": 390, "height": 844 },
      { "label": "Desktop", "width": 1440, "height": 900 }
    ]
  }'
```

| Field | Required | Description |
|---|---|---|
| `baseUrl` + `pages` | one of these two | Base URL + array of page paths to resolve against it |
| `urls` | one of these two | Array of full URLs, instead of `baseUrl` + `pages` |
| `viewports` | yes | Array of `{ label?, width, height }`; width/height clamped to 200–3000px server-side |
| `timeoutMs` | no | Navigation timeout per page (default `15000`) |
| `settleMs` | no | Extra wait after load before measuring (default `500`) |

Response: `{ pages: [{ url, viewports: [{ label, width, height, issues, screenshot, navigationError? }], fixSuggestions: [...] }] }`.
Each issue is `{ check, message, selector, rect, severity }`; `screenshot`
is a base64 `data:image/png;...` full-page capture with every issue
highlighted and numbered. Each `fixSuggestions` entry is
`{ check, selector, message, elementVaries, brokenViewports, okViewports, scoped, breakpointHint, suggestion, fixCode }`.

### `POST /api/preview-fix`

```bash
curl -s -X POST http://localhost:3000/api/preview-fix \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://localhost:3000/dashboard",
    "viewport": { "width": 390, "height": 844 },
    "css": ".user-table { overflow-x: auto; }",
    "check": "horizontal-overflow",
    "selector": null,
    "elementVaries": true
  }'
```

| Field | Required | Description |
|---|---|---|
| `url` | yes | The exact page the issue was found on |
| `viewport` | yes | `{ width, height }`, clamped to 200–3000px server-side |
| `css` | yes | The CSS to try — normally a `fixSuggestions[].fixCode` value |
| `check` | yes | e.g. `"horizontal-overflow"` — rejected (400) for `broken-image`, which has no CSS fix |
| `selector` | no | `fixSuggestions[].selector` for this bug (omit for page-level checks) |
| `elementVaries` | no | `true` for page-level checks (currently just `horizontal-overflow`) |

Response: `{ verdict, beforeSeverity, afterSeverity, before, after, cssError? }`.

## Testing

```bash
npm test
```

Runs `next build` first, then 47 tests across 5 files — all against a
real headless browser and a real `next start` server, no mocking of the
DOM, Playwright, or route handlers:

- `scanViewport.test.js` / `route.test.ts` — the detection engine and
  `/api/scan`, asserting exactly which checks fire on `/demo` and
  `/demo/edge-cases` at each viewport, plus error handling and input
  validation.
- `suggestFixes.test.js` — pure-function suite for the scoping logic,
  fixCode generation (including CSS-escaping), and viewport grouping.
- `previewFix.test.js` / `previewFixRoute.test.ts` — inject the real
  `fixCode` this project generates for its own demo pages and assert on
  the real, measured outcome (not hand-written "good" CSS).

## Known limitations

- Checks static, already-rendered DOM only — no clicking, opening menus,
  or other interaction-triggered bugs.
- `overlapping-elements` and `offscreen-element` only scan interactive
  elements (`button`/`a[href]`/`input`/`[role="button"]`/`[role="link"]`),
  not arbitrary `<div>`/`<span>` overlaps.
- `horizontal-overflow` reports up to 3 offending elements, prioritizing
  structural causes over same-width text — the highlighted screenshot is
  there so you can visually confirm the real cause.
- Suggested fixes are generic templates per check type, not an analysis
  of your actual code — a starting point, not a guaranteed-correct patch.
- Each scan launches a fresh browser per viewport; the API route has a
  60-second budget (`maxDuration`), enough for a handful of page ×
  viewport combinations but not a large matrix. Screenshots are returned
  as base64 in the JSON response, so a large matrix means a large payload.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + [React](https://react.dev) + TypeScript
- [Tailwind CSS](https://tailwindcss.com)
- [Playwright](https://playwright.dev) — headless Chromium, viewport emulation, DOM measurement, and screenshots, run server-side (`export const runtime = "nodejs"`)
- [Vitest](https://vitest.dev) — test runner; `lib/nextServer.js` spawns a real `next start` server for tests to scan against

## Adopting this in another project

Copy `lib/` (`checks.js`, `scanViewport.js`, `suggestFixes.js`,
`previewFix.js`, `nextServer.js`) and `app/api/scan/` +
`app/api/preview-fix/`, add the dependencies from `package.json`, then
reuse `app/page.tsx` as a starting point for your own dashboard, or call
`POST /api/scan` / `POST /api/preview-fix` from any frontend you already have.

## License

MIT — see [LICENSE](./LICENSE).
