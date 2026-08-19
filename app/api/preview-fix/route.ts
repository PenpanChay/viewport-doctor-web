import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright";
import { previewFix, evaluatePreview, NOT_PREVIEWABLE_CHECKS } from "@/lib/previewFix";

// Playwright needs a real Node.js process (it spawns a browser binary), so
// this route can't run on the Edge runtime.
export const runtime = "nodejs";
export const maxDuration = 30;

type PreviewRequestBody = {
  url?: string;
  viewport?: { width?: number; height?: number };
  css?: string;
  check?: string;
  selector?: string | null;
  elementVaries?: boolean;
};

const MIN_DIMENSION = 200;
const MAX_DIMENSION = 3000;

export async function POST(request: NextRequest) {
  let body: PreviewRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body.url || typeof body.url !== "string") {
    return NextResponse.json({ error: 'Provide "url" - the exact page this issue was found on.' }, { status: 400 });
  }
  const width = Number(body.viewport?.width);
  const height = Number(body.viewport?.height);
  if (!width || !height || width <= 0 || height <= 0) {
    return NextResponse.json(
      { error: 'Provide "viewport": { width, height } - the exact size the issue was found at.' },
      { status: 400 }
    );
  }
  if (!body.check || typeof body.check !== "string") {
    return NextResponse.json({ error: 'Provide "check" - which issue this preview is verifying.' }, { status: 400 });
  }
  if (typeof body.css !== "string" || !body.css.trim()) {
    return NextResponse.json({ error: 'Provide "css" - the fix snippet to try.' }, { status: 400 });
  }
  if (NOT_PREVIEWABLE_CHECKS.has(body.check)) {
    return NextResponse.json(
      { error: `"${body.check}" isn't a CSS fix, so there's nothing to preview - see its suggestion text instead.` },
      { status: 400 }
    );
  }

  const viewport = {
    width: Math.min(Math.max(Math.round(width), MIN_DIMENSION), MAX_DIMENSION),
    height: Math.min(Math.max(Math.round(height), MIN_DIMENSION), MAX_DIMENSION),
  };

  const browser = await chromium.launch();
  try {
    const { before, after, navigationError, cssError } = await previewFix(browser, body.url, viewport, body.css);

    if (navigationError) {
      return NextResponse.json({ error: `Could not open the page to preview: ${navigationError}` }, { status: 502 });
    }

    const evaluation = evaluatePreview({
      before,
      after,
      check: body.check,
      selector: body.selector ?? null,
      elementVaries: Boolean(body.elementVaries),
    });

    return NextResponse.json({ ...evaluation, ...(cssError ? { cssError } : {}) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Preview failed: ${message}` }, { status: 500 });
  } finally {
    await browser.close();
  }
}
