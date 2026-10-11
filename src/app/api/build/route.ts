import { writeOutputs } from "@/engine/output";
import { buildCards } from "@/engine/engine";
import { requireAdminRoute, sessionIdOf } from "@/lib/auth/guard";
import { allow, retryAfter } from "@/lib/auth/limits";
import { planKey, quoteTokenOk } from "@/lib/auth/quoteToken";
import { ConfigError, planFromRequest, type PlanRequest } from "@/lib/buildApi";
import { LoootError, loootFromEnv } from "@/lib/looot";
import { cardsDir, isDemo } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };
/** 6 paid builds per session per hour. */
const BUILD_LIMIT = 6;
const BUILD_WINDOW_MS = 60 * 60_000;

/**
 * Paid. Needs the admin session and CSRF token. Builds the cards only when the caller sends the token
 * the quote step issued for this exact plan, and confirms a maximum at or above the live quote.
 * The cap is the server's (BATTLECARDS_MAX_SPEND_USD). The caller can only lower the spend, never raise the cap.
 * A quote that moved above the confirmed maximum answers 409 with the new quote and runs nothing.
 */
export async function POST(req: Request) {
  const blocked = await requireAdminRoute(req);
  if (blocked) return blocked;
  const sid = await sessionIdOf(req);
  const key = `build:${sid}`;
  if (!allow(key, BUILD_LIMIT, BUILD_WINDOW_MS)) return Response.json({ error: "Too many builds this hour." }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(retryAfter(key) || 60) } });
  let body: PlanRequest;
  try {
    body = (await req.json()) as PlanRequest;
  } catch {
    return Response.json({ error: "Send JSON." }, { status: 400, headers: NO_STORE });
  }
  try {
    const p = await planFromRequest(body);
    const confirmed = Math.round(Number(body.confirmedMaxUsd) * 1_000_000);
    if (!Number.isFinite(confirmed) || confirmed < p.quote.totalMicros) {
      return Response.json({ error: "Confirm a maximum at or above the quote first.", totalMicros: p.quote.totalMicros }, { status: 409, headers: NO_STORE });
    }
    if (isDemo()) return Response.json({ demo: true, message: "Demo mode makes no looot call and writes nothing. Run without NEXT_PUBLIC_DEMO to build real cards." }, { headers: NO_STORE });
    if (!(await quoteTokenOk(process.env, sid, planKey(p.config), body.quoteToken))) {
      return Response.json({ error: "Get a quote for this exact request first. The quote is missing, expired or for different input.", totalMicros: p.quote.totalMicros }, { status: 409, headers: NO_STORE });
    }
    let looot;
    try {
      looot = loootFromEnv();
    } catch (e) {
      if (e instanceof LoootError) return Response.json({ error: "LOOOT_TOKEN is not set on the server." }, { status: 503, headers: NO_STORE });
      throw e;
    }
    const result = await buildCards({ ...p.config, maxSpendMicros: Math.min(p.config.maxSpendMicros, confirmed) }, { looot, prices: p.prices, unpriced: new Set(p.unread), now: new Date() });
    writeOutputs(cardsDir(), result.cards, p.config.product, result.actualMicros);
    return Response.json({ cards: result.cards.length, chargedMicros: result.actualMicros }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof ConfigError) return Response.json({ error: e.message }, { status: 400, headers: NO_STORE });
    return Response.json({ error: "Build failed." }, { status: 500, headers: NO_STORE });
  }
}
