import { beforeEach, describe, expect, it, vi } from "vitest";

const { buildCards } = vi.hoisted(() => ({ buildCards: vi.fn(async (..._a: unknown[]) => ({ cards: [], actualMicros: 0 })) }));
vi.mock("@/engine/engine", async (orig) => ({ ...(await orig<typeof import("@/engine/engine")>()), buildCards }));
vi.mock("@/engine/output", () => ({ writeOutputs: vi.fn() }));
vi.mock("@/lib/looot", async (orig) => ({ ...(await orig<typeof import("@/lib/looot")>()), loootFromEnv: () => ({}) }));
vi.mock("@/lib/prices", async () => {
  const { FALLBACK_PRICES } = await import("@/engine/signals");
  return { fetchPrices: async () => ({ prices: FALLBACK_PRICES, source: "fallback", unread: [] }) };
});

import { POST as build } from "@/app/api/build/route";
import { POST as quote } from "@/app/api/quote/route";
import { resetLimits } from "./limits";
import { freshEnv, post, signIn } from "./testHelpers";

const plan = { product: "Acme", competitors: ["rival.com"], signals: ["pricing"] };

beforeEach(() => {
  freshEnv();
  resetLimits();
  buildCards.mockClear();
  process.env.LOOOT_TOKEN = "lt_test_token_not_real";
});

async function quoted(s: Awaited<ReturnType<typeof signIn>>, body: object = plan) {
  const res = await quote(post("/api/quote", body, s.headers));
  expect(res.status).toBe(200);
  return (await res.json()) as { totalMicros: number; capMicros: number; quoteToken: string };
}

describe("the spend cap comes from the server", () => {
  it("ignores a cap sent by the caller, in the quote and in the build", async () => {
    process.env.BATTLECARDS_MAX_SPEND_USD = "0.25";
    const s = await signIn();
    const q = await quoted(s, { ...plan, maxSpendUsd: 1000 });
    expect(q.capMicros).toBe(250_000);
    const res = await build(post("/api/build", { ...plan, maxSpendUsd: 1000, confirmedMaxUsd: 1000, quoteToken: q.quoteToken }, s.headers));
    expect(res.status).toBe(200);
    const cfg = (buildCards.mock.calls[0] as unknown as [{ maxSpendMicros: number }])[0];
    expect(cfg.maxSpendMicros).toBeLessThanOrEqual(250_000);
  });
  it("defaults to 1 dollar when the server sets nothing", async () => {
    const s = await signIn();
    expect((await quoted(s, { ...plan, maxSpendUsd: 50 })).capMicros).toBe(1_000_000);
  });
  it("a bad server cap is an error, not a free pass", async () => {
    process.env.BATTLECARDS_MAX_SPEND_USD = "lots";
    const s = await signIn();
    expect((await quote(post("/api/quote", plan, s.headers))).status).toBe(400);
  });
});

describe("the build goes through the quote step", () => {
  it("refuses a build with no quote token and calls nothing", async () => {
    const s = await signIn();
    const q = await quoted(s);
    const res = await build(post("/api/build", { ...plan, confirmedMaxUsd: q.totalMicros / 1e6 }, s.headers));
    expect(res.status).toBe(409);
    expect(buildCards).not.toHaveBeenCalled();
  });
  it("refuses a token issued for a different plan", async () => {
    const s = await signIn();
    const q = await quoted(s, { ...plan, competitors: ["other.com"] });
    const res = await build(post("/api/build", { ...plan, confirmedMaxUsd: 5, quoteToken: q.quoteToken }, s.headers));
    expect(res.status).toBe(409);
    expect(buildCards).not.toHaveBeenCalled();
  });
  it("refuses a confirmed maximum below the quote", async () => {
    const s = await signIn();
    const q = await quoted(s);
    const res = await build(post("/api/build", { ...plan, confirmedMaxUsd: 0, quoteToken: q.quoteToken }, s.headers));
    expect(res.status).toBe(409);
    expect(buildCards).not.toHaveBeenCalled();
  });
  it("runs once with a matching token and a confirmed maximum", async () => {
    const s = await signIn();
    const q = await quoted(s);
    const res = await build(post("/api/build", { ...plan, confirmedMaxUsd: q.totalMicros / 1e6, quoteToken: q.quoteToken }, s.headers));
    expect(res.status).toBe(200);
    expect(buildCards).toHaveBeenCalledTimes(1);
  });
});

describe("spending routes are rate limited per session", () => {
  it("answers 429 with Retry-After after 6 builds in an hour", async () => {
    const s = await signIn();
    const q = await quoted(s);
    const go = () => build(post("/api/build", { ...plan, confirmedMaxUsd: q.totalMicros / 1e6, quoteToken: q.quoteToken }, s.headers));
    for (let i = 0; i < 6; i++) expect((await go()).status).toBe(200);
    const res = await go();
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(buildCards).toHaveBeenCalledTimes(6);
  });
});

describe("input limits", () => {
  it("refuses a very long product name or strengths list", async () => {
    const s = await signIn();
    expect((await quote(post("/api/quote", { ...plan, product: "x".repeat(500) }, s.headers))).status).toBe(400);
    expect((await quote(post("/api/quote", { ...plan, strengths: Array.from({ length: 50 }, () => "s") }, s.headers))).status).toBe(400);
  });
});
