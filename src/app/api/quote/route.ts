import { requireAdminRoute, sessionIdOf } from "@/lib/auth/guard";
import { allow, retryAfter } from "@/lib/auth/limits";
import { issueQuoteToken, planKey } from "@/lib/auth/quoteToken";
import { ConfigError, planFromRequest, type PlanRequest } from "@/lib/buildApi";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
/** 30 quotes per session per 10 minutes. A quote reads the public catalog, so it costs nothing, but it is a network call. */
const QUOTE_LIMIT = 30;
const QUOTE_WINDOW_MS = 10 * 60_000;

/** Free. Returns what a build would cost at list price under the server's cap, and a token the build must send back. Makes no paid call. */
export async function POST(req: Request) {
  const blocked = await requireAdminRoute(req);
  if (blocked) return blocked;
  const sid = await sessionIdOf(req);
  const key = `quote:${sid}`;
  if (!allow(key, QUOTE_LIMIT, QUOTE_WINDOW_MS)) return Response.json({ error: "Too many quotes. Wait a few minutes." }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(retryAfter(key) || 60) } });
  try {
    const p = await planFromRequest((await req.json()) as PlanRequest);
    const quoteToken = await issueQuoteToken(process.env, sid, planKey(p.config));
    return Response.json({ totalMicros: p.quote.totalMicros, capMicros: p.config.maxSpendMicros, overCap: p.quote.overCap, calls: p.quote.calls.length, lines: p.quote.lines, priceSource: p.source, unread: p.unread, quoteToken }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof ConfigError) return Response.json({ error: e.message }, { status: 400, headers: NO_STORE });
    return Response.json({ error: "Could not read the request." }, { status: 400, headers: NO_STORE });
  }
}
