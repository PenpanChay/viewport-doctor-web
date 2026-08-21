import type { BrowserContext } from 'playwright';

/**
 * Site-side fingerprinting/bot-detection code (FingerprintJS, Akamai,
 * DataDome, PerimeterX, Cloudflare, or a homegrown "verify this device"
 * check) commonly keys off a handful of well-known "this is an automated
 * browser" tells that Playwright's default Chromium leaves in place even
 * when a valid storageState (cookies + localStorage) is supplied via
 * scanViewport.ts. When one of these tells trips, it's the *target site's
 * own client-side JS* - not Playwright, and not a broken storageState -
 * that throws the session away and bounces back to a login/access-denied
 * page. From the outside that looks identical to "the storageState didn't
 * work", which is why it's easy to misdiagnose as a resolveStorageState.ts
 * or cookie-restore bug instead of what it actually is.
 *
 * This module patches the handful of highest-signal tells:
 *  - `navigator.webdriver` - Playwright/Selenium/Puppeteer all set this
 *    true via the CDP automation flag; it's the single most commonly
 *    checked automation signal because no normal user's browser ever has
 *    it set.
 *  - a realistic desktop Chrome User-Agent - Playwright's own UA string
 *    otherwise contains "HeadlessChrome/<version>".
 *  - `window.chrome` - present on every real Chrome install, absent by
 *    default on Playwright's Chromium.
 *  - `navigator.plugins` / `navigator.languages` - headless Chromium
 *    reports zero installed plugins by default; real Chrome always has a
 *    few built-ins (PDF viewer, etc.), so an empty list is itself a signal.
 *  - the Notifications permissions query - headless Chromium answers
 *    `navigator.permissions.query({name: 'notifications'})`
 *    inconsistently with `Notification.permission` in a way real Chrome
 *    never does; some fingerprint scripts specifically probe for that
 *    mismatch.
 *
 * This is intentionally conservative: it does not spoof canvas/WebGL/audio
 * fingerprints and doesn't claim to defeat any specific bot-management
 * vendor. If a target site binds its session server-side to one of *those*
 * signals (rather than just gating client-side navigation on
 * `navigator.webdriver` and friends), storageState replay will still land
 * back on the login page and no amount of client-side patching here can fix
 * that - that's a fundamentally different, much harder problem (matching a
 * device fingerprint the server already trusts, not just looking less
 * automated).
 */
export const STEALTH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Removes the clearest "this is CDP-automated Chromium" signal at the
// browser-process level rather than only patching it away in JS afterwards
// (see stealthInitScript below) - a sufficiently thorough fingerprint script
// can otherwise notice that `navigator.webdriver`'s getter was redefined.
// Pass to chromium.launch({ args: STEALTH_LAUNCH_ARGS }).
export const STEALTH_LAUNCH_ARGS: string[] = ['--disable-blink-features=AutomationControlled'];

/**
 * Runs entirely inside the browser page (passed straight to
 * context.addInitScript() - Playwright serializes the function itself and
 * re-runs it in every new document the context loads, before any of the
 * site's own scripts). Must stay self-contained the same way
 * checks.ts's runChecksInBrowser is - no references to anything outside
 * itself, since none of the enclosing Node scope travels with it.
 */
function stealthInitScript(): void {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

  const win = window as Window & { chrome?: unknown };
  if (!win.chrome) {
    win.chrome = { runtime: {} };
  }

  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

  const permissions = window.navigator.permissions;
  const originalQuery = permissions.query.bind(permissions);
  permissions.query = (parameters: PermissionDescriptor) =>
    parameters.name === 'notifications'
      ? (Promise.resolve({ state: Notification.permission }) as unknown as Promise<PermissionStatus>)
      : originalQuery(parameters);
}

/**
 * Applies the JS-level half of the stealth patch to a freshly created
 * context, before any page in it navigates. Call once right after
 * `browser.newContext(...)` - see scanViewport.ts and previewFix.ts.
 */
export async function applyStealth(context: BrowserContext): Promise<void> {
  await context.addInitScript(stealthInitScript);
}
