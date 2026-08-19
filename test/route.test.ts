import path from "path";
import { fileURLToPath } from "url";
import { NextRequest } from "next/server";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startNextServer } from "../lib/nextServer";
import { POST } from "../app/api/scan/route";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/scan (route handler, real browser + real Next.js server)", () => {
  let nextServer: Awaited<ReturnType<typeof startNextServer>>;
  let baseUrl: string;

  beforeAll(async () => {
    nextServer = await startNextServer(PROJECT_ROOT);
    baseUrl = `http://localhost:${nextServer.port}`;
  }, 30000);

  afterAll(async () => {
    await nextServer.close();
  });

  it("scans the demo page at the requested viewports and returns flattened per-viewport results", async () => {
    const response = await POST(
      postRequest({
        baseUrl,
        pages: ["/demo"],
        viewports: [
          { label: "Mobile", width: 390, height: 844 },
          { label: "Desktop", width: 1440, height: 900 },
        ],
      })
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.pages).toHaveLength(1);
    expect(data.pages[0].viewports).toHaveLength(2);

    const mobile = data.pages[0].viewports.find((v: { label: string }) => v.label === "Mobile");
    expect(mobile.width).toBe(390);
    expect(mobile.height).toBe(844);
    expect(mobile.issues.length).toBeGreaterThan(0);
    expect(mobile.screenshot).toMatch(/^data:image\/png;base64,/);
  }, 30000);

  it("includes a fix suggestion per distinct issue, scoped since every bug on /demo v2 is viewport-dependent", async () => {
    const response = await POST(
      postRequest({
        baseUrl,
        pages: ["/demo"],
        viewports: [
          { label: "Mobile", width: 390, height: 844 },
          { label: "Desktop", width: 1440, height: 900 },
        ],
      })
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    const fixSuggestions = data.pages[0].fixSuggestions;
    expect(Array.isArray(fixSuggestions)).toBe(true);
    expect(fixSuggestions.length).toBeGreaterThan(0);

    // All 3 bugs on /demo v2 (text-overflow, overflowing-image,
    // overlapping-elements) fire at Mobile but not Desktop by design - see
    // app/demo/page.tsx - so every suggestion here should be scoped, none
    // "occurs at every viewport" unconditional.
    for (const check of ["text-overflow", "overflowing-image", "overlapping-elements"]) {
      const fixes = fixSuggestions.filter((f: { check: string }) => f.check === check);
      expect(fixes.length).toBeGreaterThan(0);
      fixes.forEach((fix: { scoped: boolean; okViewports: Array<{ label: string }>; suggestion: string }) => {
        expect(fix.scoped).toBe(true);
        expect(fix.okViewports.some((v) => v.label === "Desktop")).toBe(true);
        expect(fix.suggestion).toMatch(/don't disturb/i);
      });
    }

    // overlapping-elements' advice should name the real fix for this
    // specific bug - two grid items sharing one cell - which is
    // `grid-column`, not the generic margin/padding nudge.
    const overlapFixes = fixSuggestions.filter((f: { check: string }) => f.check === "overlapping-elements");
    overlapFixes.forEach((fix: { suggestion: string; fixCode: string }) => {
      expect(fix.suggestion).toMatch(/grid-column/i);
      expect(fix.fixCode).toMatch(/grid-column-start/);
    });

    // Every suggestion also carries a ready-to-paste CSS snippet, not just prose.
    fixSuggestions.forEach((f: { fixCode: string }) => expect(typeof f.fixCode).toBe("string"));
  }, 30000);

  it("includes fix suggestions for the checks demonstrated on /demo/edge-cases", async () => {
    const response = await POST(
      postRequest({
        baseUrl,
        pages: ["/demo/edge-cases"],
        viewports: [{ label: "Mobile", width: 390, height: 844 }],
      })
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    const fixSuggestions = data.pages[0].fixSuggestions;

    // fixed-overlap and offscreen-element fire here (the announcement bar
    // covering the title, and the "Saved" toast pinned above the
    // viewport) - both broken at this Mobile viewport, clearing only at
    // Desktop (1440px) and up, same as every other bug on this page.
    const overlap = fixSuggestions.find((f: { check: string }) => f.check === "fixed-overlap");
    expect(overlap).toBeDefined();
    expect(overlap.fixCode).toMatch(/padding-top/);

    const offscreen = fixSuggestions.find((f: { check: string }) => f.check === "offscreen-element");
    expect(offscreen).toBeDefined();
    expect(offscreen.fixCode).toMatch(/position: static/);

    // The 500px-wide image is also incidentally wide enough to push the
    // whole page past this (Mobile-only) viewport - the one real exercise
    // of horizontal-overflow's fix suggestion in this route's test suite,
    // now that /demo's oversized dialog no longer causes page-level
    // overflow (see app/demo/page.tsx).
    const overflow = fixSuggestions.find((f: { check: string }) => f.check === "horizontal-overflow");
    expect(overflow).toBeDefined();

    // End-to-end sanity for the 6 checks added in this round - each has its
    // own dedicated, deliberately-broken card on this page (see
    // app/demo/edge-cases/page.tsx), so a full /api/scan call should
    // surface a real, non-placeholder fix suggestion for every one of them,
    // not just the pre-existing checks above.
    const tinyTapTarget = fixSuggestions.find((f: { check: string }) => f.check === "tiny-tap-target");
    expect(tinyTapTarget).toBeDefined();
    expect(tinyTapTarget.fixCode).toMatch(/min-width: 24px/);

    const distortedImage = fixSuggestions.find((f: { check: string }) => f.check === "distorted-image");
    expect(distortedImage).toBeDefined();
    expect(distortedImage.fixCode).toMatch(/aspect-ratio: 500 \/ 120/);
  }, 30000);

  it("includes a fix suggestion for missing-viewport-meta on /demo/broken-meta", async () => {
    // Split out from /demo/edge-cases onto its own dedicated page - see
    // that page's own top comment for why this one check can't share the
    // "broken below 1440px, clean above it" story every other bug there
    // now tells. Its suggestion is deliberately excluded from the
    // CSS-fixCode shape the checks above use - it's a literal <meta> tag
    // with its own HTML-specific paste-location note, not a stylesheet
    // rule.
    const response = await POST(
      postRequest({
        baseUrl,
        pages: ["/demo/broken-meta"],
        viewports: [{ label: "Mobile", width: 390, height: 844 }],
      })
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    const fixSuggestions = data.pages[0].fixSuggestions;

    const viewportMeta = fixSuggestions.find((f: { check: string }) => f.check === "missing-viewport-meta");
    expect(viewportMeta).toBeDefined();
    expect(viewportMeta.fixCode).toMatch(/<meta name="viewport"/);
  }, 30000);

  it("rejects a request with neither urls nor baseUrl+pages", async () => {
    const response = await POST(postRequest({ viewports: [{ label: "Mobile", width: 390, height: 844 }] }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/urls|baseUrl/);
  });

  it("rejects a request with no viewports", async () => {
    const response = await POST(postRequest({ baseUrl, pages: ["/demo"], viewports: [] }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/viewport/i);
  });

  it("rejects a request body that isn't valid JSON", async () => {
    const request = new NextRequest("http://localhost/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/valid JSON/);
  });

  it("clamps an out-of-range custom viewport instead of passing it straight to the browser", async () => {
    const response = await POST(
      postRequest({
        baseUrl,
        pages: ["/demo"],
        viewports: [{ label: "Huge", width: 50000, height: 50000 }],
      })
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    const huge = data.pages[0].viewports[0];
    expect(huge.width).toBeLessThanOrEqual(3000);
    expect(huge.height).toBeLessThanOrEqual(3000);
  }, 20000);
});
