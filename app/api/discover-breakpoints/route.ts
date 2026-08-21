import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright";
import { discoverBreakpoints } from "@/lib/discoverBreakpoints";
import { resolveStorageState } from "@/lib/resolveStorageState";

// Playwright needs a real Node.js process (it spawns a browser binary), so
// this route can't run on the Edge runtime.
export const runtime = "nodejs";
// A full 320-1920px sweep plus binary-search refinement per transition
// found normally finishes in single-digit seconds, but a slow real-world
// site (network, heavy JS) can take longer - same generous ceiling as
// /api/scan rather than a tight one that would fail a legitimately slow
// page instead of a broken one.
export const maxDuration = 60;

type DiscoverRequestBody = {
  url?: string;
  minWidth?: number;
  maxWidth?: number;
  height?: number;
  storageState?: unknown;
};

const MIN_DIMENSION = 200;
const MAX_DIMENSION = 3000;

export async function POST(request: NextRequest) {
  let body: DiscoverRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body.url || typeof body.url !== "string") {
    return NextResponse.json({ error: 'Provide "url" - the exact page to scan.' }, { status: 400 });
  }

  const minWidthInput = Number(body.minWidth ?? 320);
  const maxWidthInput = Number(body.maxWidth ?? 1920);
  if (!Number.isFinite(minWidthInput) || !Number.isFinite(maxWidthInput) || minWidthInput >= maxWidthInput) {
    return NextResponse.json(
      { error: '"minWidth" must be a number smaller than "maxWidth".' },
      { status: 400 }
    );
  }
  const minWidth = Math.min(Math.max(Math.round(minWidthInput), MIN_DIMENSION), MAX_DIMENSION);
  const maxWidth = Math.min(Math.max(Math.round(maxWidthInput), MIN_DIMENSION), MAX_DIMENSION);
  if (minWidth >= maxWidth) {
    return NextResponse.json(
      { error: `"minWidth" and "maxWidth" must be at least ${MIN_DIMENSION}px apart after clamping to [${MIN_DIMENSION}, ${MAX_DIMENSION}].` },
      { status: 400 }
    );
  }

  const heightInput = Number(body.height ?? 900);
  const height = Number.isFinite(heightInput)
    ? Math.min(Math.max(Math.round(heightInput), MIN_DIMENSION), MAX_DIMENSION)
    : 900;

  const storageState = resolveStorageState(body.storageState);
  if (storageState.error) {
    return NextResponse.json({ error: storageState.error }, { status: 400 });
  }

  const browser = await chromium.launch();
  try {
    const result = await discoverBreakpoints(browser, body.url, {
      minWidth,
      maxWidth,
      height,
      storageState: storageState.value,
    });

    if (result.navigationError) {
      return NextResponse.json(
        { error: `Could not open the page to scan: ${result.navigationError}` },
        { status: 502 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Breakpoint discovery failed: ${message}` }, { status: 500 });
  } finally {
    await browser.close();
  }
}
