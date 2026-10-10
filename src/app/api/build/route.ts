import { writeOutputs } from "@/engine/output";
import { buildCards } from "@/engine/engine";
import { ConfigError, planFromRequest, type PlanRequest } from "@/lib/buildApi";
import { LoootError, loootFromEnv } from "@/lib/looot";
import { cardsDir, isDemo } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Paid. Builds the cards after the caller confirms a maximum at or above the live quote.
 * A quote that moved above the confirmed maximum answers 409 with the new quote and runs nothing.
 */
export async function POST(req: Request) {
  let body: PlanRequest;
  try {
    body = (await req.json()) as PlanRequest;
  } catch {
    return Response.json({ error: "Send JSON." }, { status: 400 });
  }
  try {
    const p = await planFromRequest(body);
    const confirmed = Math.round(Number(body.confirmedMaxUsd) * 1_000_000);
    if (!Number.isFinite(confirmed) || confirmed < p.quote.totalMicros) {
      return Response.json({ error: "Confirm a maximum at or above the quote first.", totalMicros: p.quote.totalMicros }, { status: 409 });
    }
    if (isDemo()) return Response.json({ demo: true, message: "Demo mode makes no looot call and writes nothing. Run without NEXT_PUBLIC_DEMO to build real cards." });
    let looot;
    try {
      looot = loootFromEnv();
    } catch (e) {
      if (e instanceof LoootError) return Response.json({ error: "LOOOT_TOKEN is not set on the server." }, { status: 503 });
      throw e;
    }
    const result = await buildCards({ ...p.config, maxSpendMicros: Math.min(p.config.maxSpendMicros, confirmed) }, { looot, prices: p.prices, unpriced: new Set(p.unread), now: new Date() });
    writeOutputs(cardsDir(), result.cards, p.config.product, result.actualMicros);
    return Response.json({ cards: result.cards.length, chargedMicros: result.actualMicros });
  } catch (e) {
    if (e instanceof ConfigError) return Response.json({ error: e.message }, { status: 400 });
    return Response.json({ error: e instanceof Error ? e.message : "Build failed." }, { status: 500 });
  }
}
