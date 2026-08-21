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

## Scanning pages behind a login (storageState + sessionStorageState)

`/api/scan` accepts two optional fields for authenticated scans:

- **`storageState`** — a [Playwright storage state](https://playwright.dev/docs/auth)
  object (`{ cookies, origins }`) captured from an already-authenticated
  browser session. When present, every page/viewport scanned reuses that
  session instead of an anonymous one, so pages behind a login wall get
  scanned for real instead of redirecting to a login page. It works with any
  cookie-based session, encrypted/opaque tokens included — Playwright replays
  the cookie byte-for-byte without needing to understand what's inside it.
- **`sessionStorageState`** — see the next section. Only needed for sites
  that keep part of their session in `sessionStorage`.

### Sites that also need sessionStorage

Playwright's `storageState()` API — and therefore the `storageState` field
above, however it was captured — **only ever covers cookies and
`localStorage`. It has no concept of `sessionStorage` at all.** Some sites
(SSO/CMS-style login flows in particular) keep a piece of the session in
`sessionStorage`, so a scan can still bounce back to what looks like a login
page even with a valid, complete `storageState` — because the server-side
cookie check passes, but a client-side check reading `sessionStorage` fails.

If that happens, capture the site's `sessionStorage` separately and pass it
as `sessionStorageState` — an array of
`{ origin, sessionStorage: [{ name, value }] }` objects, one per origin. The
app's UI has a dedicated **"🔒 Session storage state"** field for it, right
below "Storage state". Leave it empty for sites that don't need it.

### Getting storageState + sessionStorageState

**Option A — try it against the bundled demo (no external site needed):** in
the app, click **🔑 Try a login-protected demo** — it logs into `/demo/login`
with a real headless browser server-side and fills in both fields for you.
(`/demo/login` also seeds a small `sessionStorage` marker on load purely so
this button demonstrates the `sessionStorageState` shape too —
`/demo/protected`'s own redirect still only checks the session cookie, so
nothing in the bundled demo is actually gated on it.)

**Option B — `POST /api/login-storage-state` (automated, any site):** drives
a real headless browser to a login form, fills it in, submits, and returns
both `storageState` and `sessionStorageState` in one response:

```bash
curl -X POST http://localhost:3000/api/login-storage-state \
  -H "Content-Type: application/json" \
  -d '{
    "loginUrl": "https://your-site/login",
    "fields": [
      { "selector": "#email", "value": "your-email" },
      { "selector": "#password", "value": "your-password" }
    ],
    "submitSelector": "button[type=submit]",
    "successUrlPattern": "/dashboard"
  }'
```

Paste `loginUrl` as the login page's entry point (not a URL with a one-time
`?state=...`/`?token=...` param some SSO flows redirect to — those are
generated fresh per visit and can't be hardcoded). `successUrlPattern` is a
regex checked against the post-login URL; omit it to fall back to "did the
URL change at all" instead. Paste the response's `storageState` and
`sessionStorageState` straight into the app's two fields, or into
`/api/scan`'s body directly under the same field names.

This endpoint accepts credentials in the request body so it can type them
into the target site's own form — see the security note in
`app/api/login-storage-state/route.ts` before exposing it beyond local/trusted
use.

**Option C — export manually (no endpoint handles your credentials at all):**

```bash
npx playwright open --save-storage=state.json https://your-site/login
```

Log in manually in the browser window that opens. **Before closing it**, if
the site might use `sessionStorage`, open DevTools' console on that tab and
run:

```js
copy(JSON.stringify([{
  origin: window.location.origin,
  sessionStorage: Object.keys(window.sessionStorage).map(name => ({
    name, value: window.sessionStorage.getItem(name)
  }))
}], null, 2))
```

(Use DevTools' `copy()` helper, not a manual select-and-copy of the printed
result — copying the console's own quoted/escaped display of a string
instead of the raw value is the most common cause of a "must be valid JSON"
error here.) Paste that into the app's "Session storage state" field. Then
**close the window** (not the terminal) — Playwright writes `state.json` at
that point; paste its contents into "Storage state".

`state.json` (and similarly-named exports) are gitignored: the file is a live
authenticated session, equivalent to a password — never commit or share one,
and prefer a dedicated test account over a real user's login.

## API reference

| Endpoint | Purpose |
|---|---|
| `POST /api/scan` | `{ baseUrl+pages or urls, viewports, storageState?, sessionStorageState? }` → issues + screenshot + fix suggestions per page/viewport |
| `POST /api/login-storage-state` | `{ loginUrl, fields, submitSelector, successUrlPattern? }` → logs in with a real browser and returns `{ storageState, sessionStorageState }` for use with `/api/scan` above |
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
