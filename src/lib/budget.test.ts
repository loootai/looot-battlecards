import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildCards, idempotencyKey, payableMicros, planCalls, REFRESH_MS } from "@/engine/engine";
import { FALLBACK_PRICES } from "@/engine/signals";
import type { BattlecardConfig } from "@/engine/types";
import { buildConfig } from "@/engine/config";
import { Budget, DEFAULT_LIMITS, HARD_EXPIRY_MS, RESERVE_TTL_MS, budgetFieldError } from "./budget";
import { LoootError, type LoootRun, type LoootRunner } from "./looot";

const now = new Date("2026-10-10T09:00:00Z");
let dir: string;
let file: string;
const open = () => new Budget(file);

beforeEach(() => {
  mkdirSync(join(process.cwd(), ".vitest"), { recursive: true });
  dir = mkdtempSync(join(process.cwd(), ".vitest", "budget-"));
  file = join(dir, "budget.json");
});

function runner(answer: (n: number, endpointId: string) => LoootRun | Promise<LoootRun>) {
  const calls: { endpointId: string; key: string }[] = [];
  const looot: LoootRunner = {
    async runAndWait(endpointId, _input, key) {
      calls.push({ endpointId, key });
      return answer(calls.length, endpointId);
    },
  };
  return { looot, calls };
}
const news = { news: [{ title: "Rival raises prices", link: "https://n.example/1", source: "N", date: "2 days ago" }] };
const completed = (cost: number): LoootRun => ({ runId: "run_ok", status: "completed", result: news, actualCost: cost });
// One competitor, one signal, one call: serper-news at 1,000 micros.
const cfg = (domain = "rival.com", capUsd = 5): BattlecardConfig => buildConfig({ product: { name: "Acme" }, competitors: [domain], signals: ["news"], maxSpendUsd: capUsd });
const build = (config: BattlecardConfig, looot: LoootRunner, ledger: Budget, at: Date = now, freshTag?: string) =>
  buildCards(config, { looot, prices: FALLBACK_PRICES, now: at, ledger, freshTag });

describe("period budget", () => {
  it("has a default daily and monthly limit that the owner can change", async () => {
    const b = open();
    expect((await b.status(now)).limits).toEqual(DEFAULT_LIMITS);
    await b.setLimits({ dailyMicros: 2_000_000, monthlyMicros: 9_000_000 });
    expect((await open().status(now)).limits).toEqual({ dailyMicros: 2_000_000, monthlyMicros: 9_000_000 });
  });

  it("lets exactly one of two concurrent reservations through when their sum is over the budget", async () => {
    await open().setLimits({ dailyMicros: 1_000_000, monthlyMicros: 5_000_000 });
    const out = await Promise.all([open().reserve("k1", 700_000, now), open().reserve("k2", 700_000, now)]);
    expect(out.filter((r) => r.ok)).toHaveLength(1);
    expect(out.filter((r) => !r.ok)).toHaveLength(1);
    expect((await open().status(now)).day.reservedMicros).toBe(700_000);
  });

  it("holds under 25 concurrent reservations from separate handles", async () => {
    await open().setLimits({ dailyMicros: 1_000_000, monthlyMicros: 5_000_000 });
    const out = await Promise.all(Array.from({ length: 25 }, (_, i) => open().reserve(`k${i}`, 100_000, now)));
    expect(out.filter((r) => r.ok)).toHaveLength(10);
    const s = await open().status(now);
    expect(s.day.reservedMicros).toBe(1_000_000);
    expect(s.day.remainingMicros).toBe(0);
  });

  it("stops many small runs at the budget and says which limit it hit", async () => {
    await open().setLimits({ dailyMicros: 300_000, monthlyMicros: 300_000 });
    const b = open();
    let ok = 0;
    let last = "";
    for (let i = 0; i < 10; i++) {
      const r = await b.reserve(`s${i}`, 100_000, now);
      if (r.ok) ok++;
      else last = r.message;
    }
    expect(ok).toBe(3);
    expect(last).toMatch(/budget is reached/i);
  });

  it("counts a settled run against the day and the month, and a new day starts clean", async () => {
    const b = open();
    await b.setLimits({ dailyMicros: 1_000_000, monthlyMicros: 5_000_000 });
    await b.reserve("a", 400_000, now);
    await b.settle("a", "fp", 350_000, now);
    const s = await b.status(now);
    expect(s.day.usedMicros).toBe(350_000);
    expect(s.month.usedMicros).toBe(350_000);
    const s2 = await b.status(new Date("2026-10-11T09:00:00Z"));
    expect(s2.day.usedMicros).toBe(0);
    expect(s2.month.usedMicros).toBe(350_000);
  });

  it("releases a reservation", async () => {
    const b = open();
    await b.reserve("a", 400_000, now);
    await b.release("a");
    expect((await b.status(now)).day.reservedMicros).toBe(0);
  });

  it("rejects limits that are not positive or put the day above the month", async () => {
    const b = open();
    await expect(b.setLimits({ dailyMicros: 0, monthlyMicros: 1_000_000 })).rejects.toThrow();
    await expect(b.setLimits({ dailyMicros: 5_000_000, monthlyMicros: 1_000_000 })).rejects.toThrow(/daily/i);
    await expect(b.setLimits({ dailyMicros: Number.NaN, monthlyMicros: 1_000_000 })).rejects.toThrow();
  });

  it("survives a damaged file by falling back to the defaults", async () => {
    writeFileSync(file, "{not json");
    expect((await open().status(now)).limits).toEqual(DEFAULT_LIMITS);
  });
});

describe("reconciling reservations", () => {
  async function pendingReservation() {
    const b = open();
    await b.reserve("p", 10_000, now);
    await b.attach("p", "run_p");
    return b;
  }

  it("settles a late completion to the real cost and stores the answer", async () => {
    const b = await pendingReservation();
    await b.reconcile({ getRun: async () => ({ runId: "run_p", status: "completed", result: { x: 1 }, actualCost: 0.0031 }) }, new Date(now.getTime() + 60_000));
    const s = await b.status(now);
    expect(s.day.reservedMicros).toBe(0);
    expect(s.day.usedMicros).toBe(3_100);
  });

  it("keeps the reservation while the run is still going", async () => {
    const b = await pendingReservation();
    await b.reconcile({ getRun: async () => ({ runId: "run_p", status: "running" }) }, new Date(now.getTime() + 2 * RESERVE_TTL_MS));
    const s = await b.status(now);
    expect(s.day.reservedMicros).toBe(10_000);
    expect(s.day.usedMicros).toBe(0);
  });

  it("releases when the run ended failed with no charge", async () => {
    const b = await pendingReservation();
    await b.reconcile({ getRun: async () => ({ runId: "run_p", status: "failed", actualCost: 0 }) }, new Date(now.getTime() + 60_000));
    const s = await b.status(now);
    expect(s.day.reservedMicros).toBe(0);
    expect(s.day.usedMicros).toBe(0);
  });

  it("keeps an unfetchable run reserved until the hard expiry, then releases it", async () => {
    const b = await pendingReservation();
    const broken = { getRun: async (): Promise<LoootRun> => { throw new LoootError("down", 503); } };
    await b.reconcile(broken, new Date(now.getTime() + 2 * RESERVE_TTL_MS));
    expect((await b.status(now)).day.reservedMicros).toBe(10_000);
    await b.reconcile(broken, new Date(now.getTime() + HARD_EXPIRY_MS + 1));
    expect((await b.status(now)).day.reservedMicros).toBe(0);
  });

  it("keeps a reservation that never got a run id until the hard expiry", async () => {
    const b = open();
    await b.reserve("crash", 10_000, now);
    const never = { getRun: async (): Promise<LoootRun> => { throw new Error("not called"); } };
    await b.reconcile(never, new Date(now.getTime() + 2 * RESERVE_TTL_MS));
    expect((await b.status(now)).day.reservedMicros).toBe(10_000);
    await b.reconcile(never, new Date(now.getTime() + HARD_EXPIRY_MS + 1));
    expect((await b.status(now)).day.reservedMicros).toBe(0);
  });
});

describe("idempotency keys", () => {
  const call = planCalls(cfg())[0];

  it("is the same on every day inside one refresh period", () => {
    const a = idempotencyKey(call, new Date("2026-10-08T00:00:00Z"));
    const sameWindow = new Date(Math.floor(Date.parse("2026-10-08T00:00:00Z") / REFRESH_MS) * REFRESH_MS + REFRESH_MS - 1);
    expect(idempotencyKey(call, sameWindow)).toBe(a);
  });

  it("changes only when the refresh period turns over: an explicit new request", () => {
    const t = Math.floor(Date.parse("2026-10-08T00:00:00Z") / REFRESH_MS) * REFRESH_MS;
    expect(idempotencyKey(call, new Date(t))).not.toBe(idempotencyKey(call, new Date(t + REFRESH_MS)));
  });

  it("has no date or clock time in the key", () => {
    expect(idempotencyKey(call, now)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(idempotencyKey(call, now)).not.toContain("20261010");
  });

  it("ignores letter case and spaces in the input, and has a fresh tag as its own key", () => {
    const a = { ...call, input: { q: ' "Rival" ', num: 10 } };
    const b = { ...call, input: { num: 10, q: '"rival"' } };
    expect(idempotencyKey(a, now)).toBe(idempotencyKey(b, now));
    expect(idempotencyKey(a, now, "oct")).not.toBe(idempotencyKey(a, now));
    expect(idempotencyKey(a, now, "oct")).toBe(idempotencyKey(b, now, "oct"));
  });

  it("finds no date in the input of any call of any signal", () => {
    const all = buildConfig({ product: { name: "Acme" }, competitors: ["rival.com"], maxSpendUsd: 5 });
    for (const c of planCalls(all)) expect(JSON.stringify(c.input)).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{10}/);
  });
});

describe("buildCards with the budget", () => {
  it("does not charge a repeated identical request twice", async () => {
    const b = open();
    const first = runner(() => completed(0.001));
    const r1 = await build(cfg(), first.looot, b);
    const second = runner(() => completed(0.001));
    const r2 = await build(cfg(), second.looot, b, new Date(now.getTime() + 3 * 3_600_000));
    expect(first.calls).toHaveLength(1);
    expect(second.calls).toHaveLength(0);
    expect(r2.actualMicros).toBe(0);
    expect(r2.cards[0].sections[0].status).toBe("ok");
    expect(r2.cards[0].sections[0].claims.length).toBe(r1.cards[0].sections[0].claims.length);
    expect((await b.status(now)).day.usedMicros).toBe(r1.actualMicros);
  });

  it("sends the same key on two different days of one period", async () => {
    const a = runner(() => completed(0.001));
    const c = runner(() => completed(0.001));
    const t = Math.floor(now.getTime() / REFRESH_MS) * REFRESH_MS;
    await build(cfg(), a.looot, open(), new Date(t + 1000));
    await build(cfg(), c.looot, new Budget(join(dir, "other.json")), new Date(t + REFRESH_MS - 1000));
    expect(c.calls[0].key).toBe(a.calls[0].key);
  });

  it("answers two identical requests started together with one charge", async () => {
    const slow = () => runner(async () => { await new Promise((r) => setTimeout(r, 20)); return completed(0.001); });
    const [a, c] = [slow(), slow()];
    await Promise.all([build(cfg(), a.looot, open()), build(cfg(), c.looot, open())]);
    const s = await open().status(now);
    expect(s.day.usedMicros).toBe(1_000);
    expect(s.day.reservedMicros).toBe(0);
  });

  it("charges again only for an explicit fresh build, which has its own stable key", async () => {
    const b = open();
    const a = runner(() => completed(0.001));
    await build(cfg(), a.looot, b);
    const c = runner(() => completed(0.001));
    await build(cfg(), c.looot, b, now, "oct");
    const d = runner(() => completed(0.001));
    await build(cfg(), d.looot, b, now, "oct");
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0].key).not.toBe(a.calls[0].key);
    expect(d.calls).toHaveLength(0);
  });

  it("holds total charges inside the budget when builds run at the same time", async () => {
    await open().setLimits({ dailyMicros: 3_000, monthlyMicros: 3_000 });
    const domains = ["a.com", "b.com", "c.com", "d.com", "e.com"];
    const sources = domains.map(() => runner(async () => { await new Promise((r) => setTimeout(r, 10)); return completed(0.001); }));
    const results = await Promise.all(domains.map((d, i) => build(cfg(d), sources[i].looot, open())));
    const paid = sources.reduce((n, s) => n + s.calls.length, 0);
    const s = await open().status(now);
    expect(paid).toBe(3);
    expect(s.day.usedMicros).toBe(3_000);
    expect(s.day.usedMicros + s.day.reservedMicros).toBeLessThanOrEqual(3_000);
    expect(results.filter((r) => r.cards[0].sections[0].status === "skipped")).toHaveLength(2);
  });

  it("stops many small builds one after another at the budget", async () => {
    await open().setLimits({ dailyMicros: 2_500, monthlyMicros: 2_500 });
    const b = open();
    const seen = runner(() => completed(0.001));
    for (let i = 0; i < 8; i++) await build(cfg(`s${i}.com`), seen.looot, b);
    expect(seen.calls).toHaveLength(2);
    expect((await b.status(now)).day.usedMicros).toBe(2_000);
  });

  it("refuses a call over the budget, says so, and makes no call", async () => {
    const b = open();
    await b.setLimits({ dailyMicros: 500, monthlyMicros: 500 });
    const { looot, calls } = runner(() => completed(0.001));
    const r = await build(cfg(), looot, b);
    expect(calls).toHaveLength(0);
    expect(r.cards[0].sections[0].note).toMatch(/budget is reached/i);
  });

  it("keeps the reservation of a pending call and never records it as $0", async () => {
    const b = open();
    const { looot } = runner(() => ({ runId: "run_slow", status: "running" }));
    const r = await build(cfg(), looot, b);
    expect(r.cards[0].sections[0].status).toBe("pending");
    const s = await b.status(now);
    expect(s.day.reservedMicros).toBe(1_000);
    expect(s.day.usedMicros).toBe(0);
    expect(r.committedMicros).toBe(1_000);
  });

  it("settles a pending call to its real cost when it finishes later", async () => {
    const b = open();
    await build(cfg(), runner(() => ({ runId: "run_slow", status: "running" })).looot, b);
    await b.reconcile({ getRun: async () => ({ runId: "run_slow", status: "completed", result: news, actualCost: 0.0007 }) }, new Date(now.getTime() + 60_000));
    const s = await b.status(now);
    expect(s.day.reservedMicros).toBe(0);
    expect(s.day.usedMicros).toBe(700);
    const again = runner(() => completed(0.001));
    await build(cfg(), again.looot, b);
    expect(again.calls).toHaveLength(0);
  });

  it("releases the reservation of a call that looot refused with an HTTP answer", async () => {
    const b = open();
    const { looot } = runner(() => { throw new LoootError("bad input", 400, "invalid_input"); });
    const r = await build(cfg(), looot, b);
    expect(r.cards[0].sections[0].status).toBe("failed");
    const s = await b.status(now);
    expect(s.day.reservedMicros).toBe(0);
    expect(s.day.usedMicros).toBe(0);
  });

  it("releases a run looot reports failed at no charge", async () => {
    const b = open();
    const { looot } = runner(() => ({ runId: "r", status: "failed", actualCost: 0, error: { code: "provider_error" } }));
    await build(cfg(), looot, b);
    expect((await b.status(now)).day.reservedMicros).toBe(0);
  });

  it("keeps the reservation when the network fails and the outcome is unknown", async () => {
    const b = open();
    const { looot } = runner(() => { throw new TypeError("fetch failed"); });
    await build(cfg(), looot, b);
    expect((await b.status(now)).day.reservedMicros).toBe(1_000);
  });

  it("counts only the calls without a stored answer in the up-front check", async () => {
    const b = open();
    const plan = planCalls(cfg());
    expect(await payableMicros(plan, b, now)).toBe(1_000);
    await build(cfg(), runner(() => completed(0.001)).looot, b);
    expect(await payableMicros(plan, b, now)).toBe(0);
  });
});

describe("budget fields in a request", () => {
  it("names a request that tries to carry a budget", () => {
    expect(budgetFieldError({ dailyUsd: 1000 })).toMatch(/cannot set the budget/);
    expect(budgetFieldError({ product: "Acme" })).toBeNull();
  });
});
