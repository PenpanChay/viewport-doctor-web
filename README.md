# Viewport UI Checker

A Next.js tool that opens your pages in a real headless browser (Playwright) at
real screen sizes and flags responsive-layout bugs — no pixel-diffing, no
mocking, just measured DOM geometry (`getBoundingClientRect`/`scrollWidth`).
Every issue comes with a highlighted screenshot, the exact element to fix, an
Expected/Actual/Overflow breakdown, and a plain-language + CSS-snippet fix
suggestion.

## Quickstart

```bash
git clone https://github.com/PenpanChay/viewport-doctor-web.git
cd viewport-doctor-web
npm install        # also downloads Playwright's bundled Chromium (~150MB, one-off)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), pick viewports, enter a
base URL + pages (or use the bundled `/demo` pages), and click **Run scan**.
No environment variables or API keys required — see `.env.example`.

**Requirements:** Node.js 20+ and npm.

## 8 viewport presets

| Preset | Size | Preset | Size |
|---|---|---|---|
| Mobile S | 320×568 | Tablet Landscape | 1024×768 |
| Mobile | 375×667 | Laptop | 1280×720 |
| Mobile Large | 390×844 | Desktop | 1440×900 |
| Tablet | 768×1024 | Large Desktop | 1920×1080 |

## 15 checks

**7 core checks** (real DOM measurements, every one fires on a real
selector/rect):

| Check | Catches |
|---|---|
| `horizontal-overflow` | Page wider than the viewport |
| `offscreen-element` | Element pushed past a viewport edge |
| `text-overflow` | Text clipped, wider than its own box |
| `overlapping-elements` | Two interactive elements colliding (e.g. button vs. badge) |
| `overflowing-image` | Image wider than its container |
| `distorted-image` | Image stretched off its natural aspect ratio |
| `fixed-overlap` | A `position: fixed`/`sticky` bar covering content beneath it |

**+ 8 additional checks**, for thoroughness beyond the assignment brief:
`clipped-element`, `oversized-modal`, `tiny-tap-target` and
`cramped-tap-targets` (WCAG 2.5.8 touch-target size/spacing),
`tiny-text`/`low-contrast-text` (legibility/WCAG AA contrast),
`missing-viewport-meta`, and `broken-image`.

## Responsive Health + Issue Detail

The dashboard scans every enabled viewport and shows a ✓/✕ per viewport with
an issue count ("Responsive Health"). Clicking an issue expands an **Issue
Detail** card: Viewport, Element, Expected, Actual, Overflow, a highlighted
screenshot, and a suggested fix (prose + ready-to-paste CSS).

## Demo pages

- `/demo` — 3 checks, a gentle first scan (fine on Tablet+, breaks below 640px).
- `/demo/edge-cases` — the other checks, broken below 1440px and clean from
  Desktop up.
- `/demo/broken-meta` — `missing-viewport-meta`, the one check that can't be
  scoped to a breakpoint (a `<meta>` tag's content is static HTML).
- `/demo/login` / `/demo/protected` — a login wall (hardcoded
  `demo` / `demo1234`, session cookie is real AES-256-GCM ciphertext, not a
  plain flag) for exercising the storage-state feature below without a real
  website's credentials.

## Scanning pages behind a login (storageState)

`/api/scan` accepts an optional `storageState` field — a [Playwright storage
state](https://playwright.dev/docs/auth) object (`{ cookies, origins }`)
captured from an already-authenticated browser session. When present, every
page/viewport scanned reuses that session instead of an anonymous one, so
pages behind a login wall get scanned for real instead of redirecting to a
login page. It works with any cookie-based session, encrypted/opaque tokens
included — Playwright replays the cookie byte-for-byte without needing to
understand what's inside it.

**Try it against the bundled demo (no external site needed):** in the app,
click **🔑 Try a login-protected demo** — it logs into `/demo/login` with a
real headless browser server-side and fills the storage-state field for you.

**Export one from a real site you're authorized to scan:**

```bash
npx playwright open --save-storage=state.json https://your-site/login
```

Log in manually in the browser window that opens, then **close the window**
(not the terminal) — Playwright writes `state.json` at that point. Paste its
contents into the app's "Storage state" field alongside the base URL/pages to
scan.

`state.json` (and similarly-named exports) are gitignored: the file is a live
authenticated session, equivalent to a password — never commit or share one,
and prefer a dedicated test account over a real user's login.

## API reference

| Endpoint | Purpose |
|---|---|
| `POST /api/scan` | `{ baseUrl+pages or urls, viewports, storageState? }` → issues + screenshot + fix suggestions per page/viewport |
| `POST /api/preview-fix` | Injects a `fixCode` snippet into a fresh load and reports `resolved`/`improved`/`unresolved`/`worse` |

## Testing

```bash
npm test
```

Runs `next build`, then 72 tests across 5 files — all against a real headless
browser and a real `next start` server (no mocked DOM/Playwright/routes).

## Tech stack

Next.js (App Router) + React + TypeScript · Tailwind CSS · Playwright
(headless Chromium, viewport emulation, measurement, screenshots) · Vitest

## License

MIT — see [LICENSE](./LICENSE).
