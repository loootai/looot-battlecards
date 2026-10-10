import { ConfigError, planFromRequest, type PlanRequest } from "@/lib/buildApi";

export const dynamic = "force-dynamic";

/** Free. Returns what a build would cost at list price, makes no paid call. */
export async function POST(req: Request) {
  try {
    const p = await planFromRequest((await req.json()) as PlanRequest);
    return Response.json({ totalMicros: p.quote.totalMicros, capMicros: p.config.maxSpendMicros, overCap: p.quote.overCap, calls: p.quote.calls.length, lines: p.quote.lines, priceSource: p.source, unread: p.unread });
  } catch (e) {
    if (e instanceof ConfigError) return Response.json({ error: e.message }, { status: 400 });
    return Response.json({ error: "Could not read the request." }, { status: 400 });
  }
}
