import path from "path";
import { fileURLToPath } from "url";
import { NextRequest } from "next/server";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startNextServer } from "../lib/nextServer";
import { POST as scanPOST } from "../app/api/scan/route";
import { POST as previewPOST } from "../app/api/preview-fix/route";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");

function postRequest(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/preview-fix (route handler, real browser + real Next.js server)", () => {
  let nextServer: Awaited<ReturnType<typeof startNextServer>>;
  let baseUrl: string;

  beforeAll(async () => {
    nextServer = await startNextServer(PROJECT_ROOT);
    baseUrl = `http://localhost:${nextServer.port}`;
  }, 30000);

  afterAll(async () => {
    await nextServer.close();
  });

  it("previews the real fixCode a /api/scan call generates and reports a genuine before/after comparison", async () => {
    // Full real pipeline: scan /demo/edge-cases (the 500px-wide image
    // there causes horizontal-overflow at Mobile - /demo's own oversized
    // dialog is scoped to its own scrollable card and no longer pushes
    // the whole page wider, see app/demo/page.tsx) through the real
    // /api/scan route, grab the exact fixCode it returned, then send
    // THAT string to /api/preview-fix - no hand-written CSS anywhere in
    // this test.
    const scanResponse = await scanPOST(
      postRequest("/api/scan", {
        baseUrl,
        pages: ["/demo/edge-cases"],
        viewports: [{ label: "Mobile", width: 390, height: 844 }],
      })
    );
    const scanData = await scanResponse.json();
    const overflowFix = scanData.pages[0].fixSuggestions.find((f: { check: string }) => f.check === "horizontal-overflow");
    expect(overflowFix).toBeDefined();

    const previewResponse = await previewPOST(
      postRequest("/api/preview-fix", {
        url: `${baseUrl}/demo/edge-cases`,
        viewport: { width: 390, height: 844 },
        css: overflowFix.fixCode,
        check: "horizontal-overflow",
        selector: null,
        elementVaries: true,
      })
    );
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json();

    expect(["resolved", "improved"]).toContain(preview.verdict);
    expect(typeof preview.beforeSeverity).toBe("number");
    expect(Array.isArray(preview.after)).toBe(true);
  }, 30000);

  it("rejects a preview request for broken-image (not a CSS fix, nothing to inject)", async () => {
    const response = await previewPOST(
      postRequest("/api/preview-fix", {
        url: `${baseUrl}/demo`,
        viewport: { width: 390, height: 844 },
        css: "/* n/a */",
        check: "broken-image",
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/isn't a CSS fix/);
  });

  it("rejects a request missing required fields", async () => {
    const response = await previewPOST(postRequest("/api/preview-fix", { url: `${baseUrl}/demo` }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/viewport/i);
  });

  it("rejects a request body that isn't valid JSON", async () => {
    const request = new NextRequest("http://localhost/api/preview-fix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const response = await previewPOST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/valid JSON/);
  });

  it("returns a 502 with a clear message when the page can't be reached", async () => {
    const response = await previewPOST(
      postRequest("/api/preview-fix", {
        url: "http://127.0.0.1:1/",
        viewport: { width: 390, height: 844 },
        css: ".x { color: red; }",
        check: "clipped-element",
        selector: "button.x",
      })
    );
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toMatch(/Could not open the page/);
  }, 15000);
});
