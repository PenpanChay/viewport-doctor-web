import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright";
import { STEALTH_LAUNCH_ARGS } from "@/lib/browserStealth";
import { captureLoginStorageState } from "@/lib/loginStorageState";

// Playwright needs a real Node.js process (it spawns a browser binary), so
// this route can't run on the Edge runtime.
export const runtime = "nodejs";
export const maxDuration = 30;

// SECURITY NOTE: like /api/scan and /api/preview-fix, this route accepts an
// arbitrary target URL and drives a real server-side browser to it - the
// same class of SSRF exposure those two routes already carry (a caller can
// point it at any URL, including internal-only ones, and this server will
// issue real requests to it). This route additionally accepts credentials
// in the request body specifically so it can type them into the target
// site's own login form - that's the whole point (see
// lib/loginStorageState.ts), but it means this endpoint must never be
// exposed to untrusted callers or the public internet without an
// authentication layer in front of it, the same as the rest of this app's
// scanning routes. Credentials are used in-memory for one login attempt
// and are never logged or persisted here.

type LoginFieldInput = { selector?: string; value?: string };

type LoginRequestBody = {
  loginUrl?: string;
  fields?: LoginFieldInput[];
  submitSelector?: string;
  successUrlPattern?: string;
  // See lib/loginStorageState.ts - fixes the race where a SPA changes the
  // URL (or sets its httpOnly cookie) before an async post-login bootstrap
  // call finishes writing the client-side session into localStorage, which
  // otherwise makes the captured storageState look complete while actually
  // missing exactly the key the target app's own client-side auth check
  // reads.
  waitForLocalStorageKey?: string;
  settleMs?: number;
  timeoutMs?: number;
  viewport?: { width?: number; height?: number };
};

const MIN_DIMENSION = 200;
const MAX_DIMENSION = 3000;
const DEFAULT_WIDTH = 1440;
const DEFAULT_HEIGHT = 900;

function resolveViewport(input: LoginRequestBody["viewport"]): { width: number; height: number } {
  const width = Number(input?.width) || DEFAULT_WIDTH;
  const height = Number(input?.height) || DEFAULT_HEIGHT;
  return {
    width: Math.min(Math.max(Math.round(width), MIN_DIMENSION), MAX_DIMENSION),
    height: Math.min(Math.max(Math.round(height), MIN_DIMENSION), MAX_DIMENSION),
  };
}

export async function POST(request: NextRequest) {
  let body: LoginRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body.loginUrl || typeof body.loginUrl !== "string") {
    return NextResponse.json({ error: 'Provide "loginUrl" - the full URL of the login page.' }, { status: 400 });
  }
  let parsedLoginUrl: URL;
  try {
    parsedLoginUrl = new URL(body.loginUrl);
  } catch {
    return NextResponse.json(
      { error: '"loginUrl" must be a full, valid URL (including "http://" or "https://").' },
      { status: 400 }
    );
  }
  if (parsedLoginUrl.protocol !== "http:" && parsedLoginUrl.protocol !== "https:") {
    return NextResponse.json({ error: '"loginUrl" must use http or https.' }, { status: 400 });
  }

  if (!Array.isArray(body.fields) || body.fields.length === 0) {
    return NextResponse.json(
      {
        error:
          'Provide "fields": [{ "selector", "value" }, ...] - at least the username and password inputs to fill in before submitting.',
      },
      { status: 400 }
    );
  }
  const fields: { selector: string; value: string }[] = [];
  for (const field of body.fields) {
    if (typeof field?.selector !== "string" || !field.selector.trim()) {
      return NextResponse.json({ error: 'Every entry in "fields" needs a non-empty "selector".' }, { status: 400 });
    }
    if (typeof field?.value !== "string") {
      return NextResponse.json({ error: `Field "${field.selector}" needs a string "value".` }, { status: 400 });
    }
    fields.push({ selector: field.selector, value: field.value });
  }

  if (!body.submitSelector || typeof body.submitSelector !== "string") {
    return NextResponse.json(
      { error: 'Provide "submitSelector" - the CSS selector of the login form\'s submit button/link.' },
      { status: 400 }
    );
  }

  if (body.successUrlPattern !== undefined) {
    if (typeof body.successUrlPattern !== "string") {
      return NextResponse.json({ error: '"successUrlPattern" must be a string (a regular expression).' }, { status: 400 });
    }
    try {
      // eslint-disable-next-line no-new -- validated for its side effect (throwing on bad syntax), the instance itself is unused here
      new RegExp(body.successUrlPattern);
    } catch {
      return NextResponse.json({ error: '"successUrlPattern" is not a valid regular expression.' }, { status: 400 });
    }
  }

  if (body.waitForLocalStorageKey !== undefined && typeof body.waitForLocalStorageKey !== "string") {
    return NextResponse.json({ error: '"waitForLocalStorageKey" must be a string (a localStorage key name).' }, { status: 400 });
  }
  if (body.settleMs !== undefined && (typeof body.settleMs !== "number" || body.settleMs < 0)) {
    return NextResponse.json({ error: '"settleMs" must be a non-negative number.' }, { status: 400 });
  }

  const viewport = resolveViewport(body.viewport);

  const browser = await chromium.launch({ args: STEALTH_LAUNCH_ARGS });
  try {
    const result = await captureLoginStorageState(browser, {
      loginUrl: body.loginUrl,
      fields,
      submitSelector: body.submitSelector,
      successUrlPattern: body.successUrlPattern,
      waitForLocalStorageKey: body.waitForLocalStorageKey,
      settleMs: body.settleMs,
      timeoutMs: body.timeoutMs,
      viewport,
    });

    if (result.error) {
      return NextResponse.json(
        {
          error: result.error,
          finalUrl: result.finalUrl,
          ...(result.storageState ? { storageState: result.storageState } : {}),
          ...(result.sessionStorageState ? { sessionStorageState: result.sessionStorageState } : {}),
        },
        { status: 502 }
      );
    }

    // Unlike /api/demo-login-storage-state (which returns a raw
    // storageState object, since the bundled demo never needed
    // sessionStorage), this returns BOTH pieces a real target site's
    // session can be split across - paste storageState into /api/scan's
    // "storageState" field and sessionStorageState into its
    // "sessionStorageState" field. Passing only storageState silently
    // drops whatever the target site keeps in sessionStorage - see
    // lib/sessionStorageState.ts.
    return NextResponse.json({
      storageState: result.storageState,
      sessionStorageState: result.sessionStorageState,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Login capture failed: ${message}` }, { status: 500 });
  } finally {
    await browser.close();
  }
}
