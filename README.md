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

## Breakpoint Discovery (bonus)

Beyond the 8 fixed presets, `POST /api/discover-breakpoints` resizes the page
in small steps to find the *real* widths where its layout actually changes —
not just where you told it to check — and classifies each as **expected**
(within 6px of a standard breakpoint: 640/768/1024/1280) or **unexpected** (a
real, possibly-unintentional layout shift nowhere near one). See
`/demo/breakpoint-demo` for a page with one of each.

## Demo pages

- `/demo` — 3 checks, a gentle first scan (fine on Tablet+, breaks below 640px).
- `/demo/edge-cases` — the other checks, broken below 1440px and clean from
  Desktop up.
- `/demo/broken-meta` — `missing-viewport-meta`, the one check that can't be
  scoped to a breakpoint (a `<meta>` tag's content is static HTML).
- `/demo/breakpoint-demo` — feeds Breakpoint Discovery above.

## API reference

| Endpoint | Purpose |
|---|---|
| `POST /api/scan` | `{ baseUrl+pages or urls, viewports }` → issues + screenshot + fix suggestions per page/viewport |
| `POST /api/preview-fix` | Injects a `fixCode` snippet into a fresh load and reports `resolved`/`improved`/`unresolved`/`worse` |
| `POST /api/discover-breakpoints` | `{ url, minWidth?, maxWidth? }` → real layout-change widths, classified expected/unexpected |

## Testing

```bash
npm test
```

Runs `next build`, then 83 tests across 7 files — all against a real headless
browser and a real `next start` server (no mocked DOM/Playwright/routes).

## Tech stack

Next.js (App Router) + React + TypeScript · Tailwind CSS · Playwright
(headless Chromium, viewport emulation, measurement, screenshots) · Vitest

## License

MIT — see [LICENSE](./LICENSE).
