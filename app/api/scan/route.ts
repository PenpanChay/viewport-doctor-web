import { NextRequest, NextResponse } from "next/server";
// lib/*.js are plain CommonJS modules - allowJs + esModuleInterop in
// tsconfig.json let TypeScript import them directly, no rewrite needed.
import { scanAllViewports } from "@/lib/scanViewport";

// Playwright needs a real Node.js process (it spawns a browser binary), so
// this route can't run on the Edge runtime.
export const runtime = "nodejs";
// Scanning several pages x several viewports (each a full browser
// navigation + screenshot) can take longer than a typical API request.
export const maxDuration = 60;

type ViewportInput = { label?: string; width?: number; height?: number };

type ScanRequestBody = {
  baseUrl?: string;
  pages?: string[];
  urls?: string[];
  viewports?: ViewportInput[];
  timeoutMs?: number;
  settleMs?: number;
};

function resolveUrls(body: ScanRequestBody): string[] {
  if (Array.isArray(body.urls) && body.urls.length > 0) {
    return body.urls;
  }
  if (body.baseUrl && Array.isArray(body.pages) && body.pages.length > 0) {
    return body.pages.map((page) => new URL(page, body.baseUrl).toString());
  }
  return [];
}

const MIN_DIMENSION = 200;
const MAX_DIMENSION = 3000;

function resolveViewports(
  input: ViewportInput[] | undefined
): { label: string; width: number; height: number }[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (v): v is Required<ViewportInput> =>
        typeof v?.width === "number" && typeof v?.height === "number" && v.width > 0 && v.height > 0
    )
    .map((v) => ({
      label: v.label?.trim() || `${Math.round(v.width)}x${Math.round(v.height)}`,
      // Clamp to sane bounds server-side regardless of what the client
      // sends, rather than trusting arbitrary numbers into a real browser.
      width: Math.min(Math.max(Math.round(v.width), MIN_DIMENSION), MAX_DIMENSION),
      height: Math.min(Math.max(Math.round(v.height), MIN_DIMENSION), MAX_DIMENSION),
    }));
}

export async function POST(request: NextRequest) {
  let body: ScanRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const urls = resolveUrls(body);
  if (urls.length === 0) {
    return NextResponse.json(
      { error: 'Provide either "urls" (array of full URLs) or "baseUrl" + "pages".' },
      { status: 400 }
    );
  }

  const viewports = resolveViewports(body.viewports);
  if (viewports.length === 0) {
    return NextResponse.json(
      { error: 'Provide at least one viewport in "viewports": [{ "label", "width", "height" }].' },
      { status: 400 }
    );
  }

  try {
    const results = await scanAllViewports({
      urls,
      viewports,
      timeoutMs: body.timeoutMs,
      settleMs: body.settleMs,
    });

    return NextResponse.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Scan failed: ${message}` }, { status: 500 });
  }
}
