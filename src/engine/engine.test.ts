import { describe, expect, it, vi } from "vitest";
import { DEMO_CONFIG, DEMO_NOW, fixtureRunner } from "@/demo/fixtures";
import type { LoootRunner } from "@/lib/looot";
import { buildCards, idempotencyKey, planCalls, quoteOf, REFRESH_MS } from "./engine";
import { cardHtml, cardMarkdown } from "./render";
import { FALLBACK_PRICES } from "./signals";
import { addSummary, summaryPrompt } from "./summary";

describe("plan and quote", () => {
  it("plans 8 calls per competitor for all signals and adds the list prices", () => {
    expect(planCalls(DEMO_CONFIG)).toHaveLength(16);
    const q = quoteOf(DEMO_CONFIG, FALLBACK_PRICES);
    expect(q.totalMicros).toBe(2 * (200 * 3 + 1000 + 1000 + 8900 + 1880 + 1880));
    expect(q.overCap).toBe(false);
  });
  it("flags a plan over the cap", () => {
    expect(quoteOf({ ...DEMO_CONFIG, maxSpendMicros: 1000 }, FALLBACK_PRICES).overCap).toBe(true);
  });
  it("gives the same idempotency key for the same call on every day of one refresh window", () => {
    const [call] = planCalls(DEMO_CONFIG);
    expect(idempotencyKey(call, DEMO_NOW)).toBe(idempotencyKey(call, new Date(DEMO_NOW.getTime() + 3_600_000)));
    expect(idempotencyKey(call, DEMO_NOW)).not.toBe(idempotencyKey(call, new Date(DEMO_NOW.getTime() + REFRESH_MS)));
  });
});

describe("buildCards", () => {
  it("builds a card per competitor and marks a failed provider instead of inventing data", async () => {
    const r = await buildCards(DEMO_CONFIG, { looot: fixtureRunner, prices: FALLBACK_PRICES, now: DEMO_NOW });
    expect(r.cards.map((c) => c.competitor.domain)).toEqual(["ledgerly.example", "paperkite.example"]);
    const tech = r.cards[1].sections.find((s) => s.signal === "tech");
    expect(tech?.status).toBe("failed");
    expect(tech?.claims).toEqual([]);
    expect(r.cards[1].sections.find((s) => s.signal === "news")?.status).toBe("empty");
    for (const c of r.cards) for (const s of c.sections) for (const cl of s.claims) {
      expect(cl.sourceUrl).toMatch(/^https:\/\//);
      expect(cl.fetchedAt).toBe(DEMO_NOW.toISOString());
    }
  });

  it("skips calls past the cap and never sends them", async () => {
    const run = vi.fn(fixtureRunner.runAndWait);
    const looot: LoootRunner = { runAndWait: run };
    const r = await buildCards({ ...DEMO_CONFIG, maxSpendMicros: 1500 }, { looot, prices: FALLBACK_PRICES, now: DEMO_NOW });
    expect(run.mock.calls.length).toBeLessThan(16);
    expect(r.committedMicros).toBeLessThanOrEqual(1500);
    expect(r.cards.flatMap((c) => c.sections).some((s) => s.status === "skipped")).toBe(true);
  });

  it("reports a run still in progress as pending, not failed", async () => {
    const looot: LoootRunner = { runAndWait: async () => ({ runId: "run_1", status: "running" }) };
    const r = await buildCards({ ...DEMO_CONFIG, competitors: [DEMO_CONFIG.competitors[0]], signals: ["news"] }, { looot, prices: FALLBACK_PRICES, now: DEMO_NOW });
    expect(r.cards[0].sections[0].status).toBe("pending");
    expect(r.cards[0].sections[0].note).toContain("run_1");
  });

  it("does not call an endpoint whose live price could not be read", async () => {
    const run = vi.fn();
    const r = await buildCards({ ...DEMO_CONFIG, competitors: [DEMO_CONFIG.competitors[0]], signals: ["news"] }, { looot: { runAndWait: run }, prices: FALLBACK_PRICES, unpriced: new Set(["serper-news"]), now: DEMO_NOW });
    expect(run).not.toHaveBeenCalled();
    expect(r.cards[0].sections[0].status).toBe("skipped");
  });
});

describe("render", () => {
  it("puts a source link and a date after every claim in markdown and html", async () => {
    const { cards } = await buildCards(DEMO_CONFIG, { looot: fixtureRunner, prices: FALLBACK_PRICES, now: DEMO_NOW });
    const md = cardMarkdown(cards[0], DEMO_CONFIG.product);
    const claimLines = md.split("\n").filter((l) => l.startsWith("- ") && !l.includes("written by you"));
    const sourced = claimLines.filter((l) => /\(\[source\]\(https:\/\/[^)]+\), 2026-10-10, [\w-]+\)$/.test(l));
    expect(sourced.length).toBeGreaterThan(15);
    expect(claimLines.length - sourced.length).toBe(2); // the two strengths the user wrote
    const html = cardHtml(cards[0], DEMO_CONFIG.product);
    expect(html).toContain("@media print");
    expect(html).toContain('<a href="https://ledgerly.example/pricing">source</a>');
  });
  it("escapes html in claims", async () => {
    const { cards } = await buildCards({ ...DEMO_CONFIG, competitors: [DEMO_CONFIG.competitors[0]], signals: ["news"] }, { looot: { runAndWait: async () => ({ runId: "r", status: "completed", result: { news: [{ title: "<script>x</script>", link: "https://n.example/1" }] } }) }, prices: FALLBACK_PRICES, now: DEMO_NOW });
    expect(cardHtml(cards[0], DEMO_CONFIG.product)).not.toContain("<script>x");
  });
});

describe("optional summary", () => {
  it("does nothing without ANTHROPIC_API_KEY", async () => {
    const { cards } = await buildCards(DEMO_CONFIG, { looot: fixtureRunner, prices: FALLBACK_PRICES, now: DEMO_NOW });
    const f = vi.fn();
    expect(await addSummary(cards[0], { env: {}, fetch: f as unknown as typeof fetch })).toBe(cards[0]);
    expect(f).not.toHaveBeenCalled();
  });
  it("stores the model text apart from the claims, and sends only claims", async () => {
    const { cards } = await buildCards(DEMO_CONFIG, { looot: fixtureRunner, prices: FALLBACK_PRICES, now: DEMO_NOW });
    const f = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "Short summary." }] }), { status: 200 }));
    const out = await addSummary(cards[0], { env: { ANTHROPIC_API_KEY: "k" }, fetch: f as unknown as typeof fetch, now: DEMO_NOW });
    expect(out.summary?.text).toBe("Short summary.");
    expect(out.sections).toBe(cards[0].sections);
    const sent = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(sent.messages[0].content).toBe(summaryPrompt(cards[0]));
    expect(summaryPrompt(cards[0])).not.toContain("Where Tallyroom wins");
  });
  it("returns the card unchanged when the API fails", async () => {
    const { cards } = await buildCards(DEMO_CONFIG, { looot: fixtureRunner, prices: FALLBACK_PRICES, now: DEMO_NOW });
    const f = vi.fn(async () => new Response("no", { status: 500 }));
    expect(await addSummary(cards[0], { env: { ANTHROPIC_API_KEY: "k" }, fetch: f as unknown as typeof fetch })).toBe(cards[0]);
  });
});
