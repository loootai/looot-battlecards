import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as exportCard } from "@/app/api/export/[domain]/route";
import { proxy } from "@/proxy";
import { resetLimits } from "./limits";
import { PW, cookieOf, freshEnv, post, signIn } from "./testHelpers";

beforeEach(() => {
  freshEnv();
  resetLimits();
});

describe("sign in", () => {
  it("a wrong password gets 401 and no cookie", async () => {
    const res = await login(post("/api/auth/login", { password: "nope-nope-nope-nope" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
  it("the right password sets a hardened cookie that opens admin routes", async () => {
    const res = await login(post("/api/auth/login", { password: PW }));
    expect(res.status).toBe(200);
    const sc = res.headers.get("set-cookie")!;
    expect(sc).toMatch(/HttpOnly/);
    expect(sc).toMatch(/SameSite=Lax/);
    expect(sc).toMatch(/Max-Age=/);
    const page = await proxy(new NextRequest("http://localhost:3000/build", { headers: { cookie: cookieOf(res) } }));
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("no-store");
  });
  it("a form post redirects to the page asked for, and never off site", async () => {
    const form = (next: string) => new Request("http://localhost:3000/api/auth/login", { method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "198.51.100.7" }, body: new URLSearchParams({ password: PW, next }) });
    expect((await login(form("/build"))).headers.get("location")).toBe("/build");
    expect((await login(form("//evil.example"))).headers.get("location")).toBe("/");
    expect((await login(form("https://evil.example"))).headers.get("location")).toBe("/");
  });
  it("locks the address after 5 wrong passwords, and the right password does not help until the window ends", async () => {
    for (let i = 0; i < 5; i++) expect((await login(post("/api/auth/login", { password: `wrong-password-${i}-xx` }))).status).toBe(401);
    const locked = await login(post("/api/auth/login", { password: PW }));
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(locked.headers.get("set-cookie")).toBeNull();
  });
  it("refuses a sign-in posted from another site", async () => {
    const res = await login(post("/api/auth/login", { password: PW }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });
  it("accepts the browser's 'Origin: null' form post when Sec-Fetch-Site says same-origin, and refuses it otherwise", async () => {
    const ok = await login(post("/api/auth/login", { password: PW }, { origin: "null", "sec-fetch-site": "same-origin" }));
    expect(ok.status).toBe(200);
    expect((await login(post("/api/auth/login", { password: PW }, { origin: "null", "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await login(post("/api/auth/login", { password: PW }, { origin: "null" }))).status).toBe(403);
  });
  it("sign out clears the cookie, and only for a same-site request", async () => {
    const ok = await logout(post("/api/auth/logout", {}));
    expect(ok.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect((await logout(post("/api/auth/logout", {}, { origin: "https://evil.example" }))).status).toBe(403);
  });
});

describe("CSRF on state-changing admin requests", () => {
  const { POST: quote } = { POST: async (r: Request) => (await import("@/app/api/quote/route")).POST(r) };
  const body = { product: "Acme", competitors: ["rival.com"] };
  it("rejects a cross-site origin even with a valid session", async () => {
    const s = await signIn();
    const res = await quote(post("/api/quote", body, { ...s.headers, origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });
  it("rejects a same-origin request without the token, or with someone else's", async () => {
    const s = await signIn();
    expect((await quote(post("/api/quote", body, { cookie: s.cookie }))).status).toBe(403);
    expect((await quote(post("/api/quote", body, { cookie: s.cookie, "x-battlecards-csrf": "AAAA" }))).status).toBe(403);
  });
  it("a request with no Origin and no fetch metadata is refused", async () => {
    const s = await signIn();
    const res = await quote(new Request("http://localhost:3000/api/quote", { method: "POST", headers: { host: "localhost:3000", ...s.headers }, body: JSON.stringify(body) }));
    expect(res.status).toBe(403);
  });
});

describe("export", () => {
  it("needs the session and is never cached", async () => {
    const closed = await exportCard(new Request("http://localhost:3000/api/export/rival.com"), { params: Promise.resolve({ domain: "rival.com" }) });
    expect(closed.status).toBe(401);
    expect(closed.headers.get("cache-control")).toBe("no-store");
    const s = await signIn();
    const open = await exportCard(new Request("http://localhost:3000/api/export/rival.com", { headers: s.headers }), { params: Promise.resolve({ domain: "rival.com" }) });
    expect(open.status).toBe(404);
    expect(open.headers.get("cache-control")).toBe("no-store");
  });
  it("in the demo, a card downloads with no-store and nosniff", async () => {
    process.env.NEXT_PUBLIC_DEMO = "1";
    delete process.env.BATTLECARDS_ADMIN_PASSWORD;
    const { DEMO_CONFIG } = await import("@/demo/fixtures");
    const domain = DEMO_CONFIG.competitors[0].domain;
    const res = await exportCard(new Request(`http://localhost:3000/api/export/${domain}`), { params: Promise.resolve({ domain }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
