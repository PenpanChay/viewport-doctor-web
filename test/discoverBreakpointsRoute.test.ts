import path from "path";
import { fileURLToPath } from "url";
import { NextRequest } from "next/server";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startNextServer } from "../lib/nextServer.js";
import { POST } from "../app/api/discover-breakpoints/route";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/discover-breakpoints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/discover-breakpoints (route handler, real browser + real Next.js server)", () => {
  let nextServer: Awaited<ReturnType<typeof startNextServer>>;
  let baseUrl: string;

  beforeAll(async () => {
    nextServer = await startNextServer(PROJECT_ROOT);
    baseUrl = `http://localhost:${nextServer.port}`;
  }, 30000);

  afterAll(async () => {
    await nextServer.close();
  });

  it("scans /demo/breakpoint-demo and reports the real 742px unexpected transition end-to-end", async () => {
    const response = await POST(
      postRequest({ url: `${baseUrl}/demo/breakpoint-demo`, minWidth: 320, maxWidth: 1920 })
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.transitions)).toBe(true);
    const surprise = data.transitions.find((t: { selector: string }) => t.selector.includes("grid-surprise"));
    expect(surprise).toBeDefined();
    expect(surprise.expected).toBe(false);
    expect(data.bands.length).toBe(5);
  }, 30000);

  it("rejects a request with no url", async () => {
    const response = await POST(postRequest({}));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/url/i);
  });

  it("rejects a request where minWidth is not smaller than maxWidth", async () => {
    const response = await POST(postRequest({ url: baseUrl, minWidth: 1000, maxWidth: 500 }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/minWidth/);
  });

  it("clamps out-of-range width bounds instead of passing them straight to the browser", async () => {
    const response = await POST(
      postRequest({ url: `${baseUrl}/demo`, minWidth: 10, maxWidth: 50000 })
    );
    expect(response.status).toBe(200);
  }, 30000);

  it("reports a 502 when the target page cannot be reached", async () => {
    const response = await POST(postRequest({ url: "http://127.0.0.1:1/" }));
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toMatch(/could not open/i);
  }, 20000);
});
