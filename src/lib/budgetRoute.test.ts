import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as budgetGet, PUT as budgetPut } from "@/app/api/budget/route";
import { POST as build } from "@/app/api/build/route";
import { POST as quote } from "@/app/api/quote/route";
import { resetLimits } from "@/lib/auth/limits";
import { freshEnv, post, signIn } from "@/lib/auth/testHelpers";

const KEYS = ["LOOOT_TOKEN", "LOOOT_API_URL", "BATTLECARDS_MAX_SPEND_USD"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
let server: Server;
let paidRuns = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.method !== "POST") return void res.end(JSON.stringify({ price: { state: "known", amountMicros: 1_000, unit: "call" } }));
    paidRuns++;
    res.end(JSON.stringify({ runId: `r${paidRuns}`, status: "completed", result: { news: [{ title: "Rival raises prices", link: "https://n.example/1", source: "N", date: "2 days ago" }] }, actualCost: 0.001 }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.LOOOT_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
beforeEach(() => {
  freshEnv();
  process.env.LOOOT_TOKEN = "lt_test_token_not_real";
  paidRuns = 0;
  resetLimits();
});

type S = Awaited<ReturnType<typeof signIn>>;
const H = { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json", "x-forwarded-for": "198.51.100.7" };
const put = (body: unknown, s: S | null) => budgetPut(new Request("http://localhost:3000/api/budget", { method: "PUT", headers: { ...H, ...(s?.headers ?? {}) }, body: JSON.stringify(body) }));
const read = async (s: S) => (await (await budgetGet(new Request("http://localhost:3000/api/budget", { headers: { ...H, cookie: s.cookie } }))).json()) as { limits: { dailyMicros: number; monthlyMicros: number }; day: { limitMicros: number; usedMicros: number; reservedMicros: number; remainingMicros: number } };
// One competitor, one signal: one serper-news call at 1,000 micros.
const PLAN = { product: "Acme", competitors: ["rival.com"], signals: ["news"] };
async function quoted(s: S, plan: object = PLAN) {
  const res = await quote(post("/api/quote", plan, s.headers));
  return (await res.json()) as { totalMicros: number; quoteToken: string };
}
const buildWith = async (s: S, plan: object = PLAN, extra: object = {}) => {
  const q = await quoted(s, plan);
  return build(post("/api/build", { ...plan, confirmedMaxUsd: q.totalMicros / 1e6, quoteToken: q.quoteToken, ...extra }, s.headers));
};

describe("budget over HTTP", () => {
  it("shows used, reserved and remaining", async () => {
    const j = await read(await signIn());
    expect(j.day.remainingMicros).toBe(j.day.limitMicros);
  });

  it("refuses to change the budget without the session", async () => {
    expect((await put({ dailyUsd: 1000, monthlyUsd: 5000 }, null)).status).toBe(401);
  });

  it("lets the signed-in owner change the budget", async () => {
    const s = await signIn();
    expect((await put({ dailyUsd: 1, monthlyUsd: 3 }, s)).status).toBe(200);
    expect((await read(s)).limits).toEqual({ dailyMicros: 1_000_000, monthlyMicros: 3_000_000 });
  });

  it("refuses a build request that carries a budget, and calls nothing", async () => {
    const s = await signIn();
    await put({ dailyUsd: 0.0005, monthlyUsd: 0.001 }, s);
    const res = await buildWith(s, PLAN, { dailyUsd: 1e9, monthlyUsd: 1e9, budget: { dailyUsd: 1e9 } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/budget/i);
    expect(paidRuns).toBe(0);
    expect((await read(s)).limits.dailyMicros).toBe(500);
  });

  it("ignores a spend cap sent by the caller: the server cap holds", async () => {
    process.env.BATTLECARDS_MAX_SPEND_USD = "0.0015";
    const s = await signIn();
    const two = { ...PLAN, signals: ["news", "reviews", "pricing"] };
    const res = await buildWith(s, two, { maxSpendUsd: 1000, capUsd: 1000, capMicros: 1e12, spendCapUsd: 1000 });
    expect(res.status).toBe(200);
    expect(paidRuns).toBe(1); // every call is 1,000 at the fake price: one fits under 1,500
  });

  it("refuses a build above the owner's budget before any call", async () => {
    const s = await signIn();
    await put({ dailyUsd: 0.0005, monthlyUsd: 0.0005 }, s);
    const res = await buildWith(s);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/budget/i);
    expect(paidRuns).toBe(0);
  });

  it("does not charge a repeated identical build twice", async () => {
    const s = await signIn();
    expect((await buildWith(s)).status).toBe(200);
    expect(paidRuns).toBe(1);
    expect((await buildWith(s)).status).toBe(200);
    expect(paidRuns).toBe(1);
    expect((await read(s)).day.usedMicros).toBe(1_000);
  });

  it("answers a repeat of a finished build from the stored result even when the budget is used up", async () => {
    const s = await signIn();
    expect((await buildWith(s)).status).toBe(200);
    await put({ dailyUsd: 0.0011, monthlyUsd: 0.0011 }, s);
    expect((await buildWith(s)).status).toBe(200);
    expect(paidRuns).toBe(1);
    const refused = await buildWith(s, { ...PLAN, competitors: ["other.com"] });
    expect(refused.status).toBe(409);
    expect(paidRuns).toBe(1);
  });
});
