import { cardHtml, cardMarkdown } from "@/engine/render";
import { requireAdminRoute } from "@/lib/auth/guard";
import { loadCards } from "@/lib/store";

export const dynamic = "force-dynamic";

const SAFE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

/** Free. Needs the admin session. Downloads one card as markdown or PDF-ready HTML. Never cached. */
export async function GET(req: Request, ctx: { params: Promise<{ domain: string }> }) {
  const blocked = await requireAdminRoute(req);
  if (blocked) return blocked;
  const { domain } = await ctx.params;
  const format = new URL(req.url).searchParams.get("format") === "html" ? "html" : "md";
  const { product, cards } = await loadCards();
  const card = cards.find((c) => c.competitor.domain === domain);
  if (!card || !/^[a-z0-9.-]+$/.test(domain)) return Response.json({ error: "No such card." }, { status: 404, headers: SAFE });
  return format === "html"
    ? new Response(cardHtml(card, product), { headers: { ...SAFE, "content-type": "text/html; charset=utf-8" } })
    : new Response(cardMarkdown(card, product), { headers: { ...SAFE, "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${domain}.md"` } });
}
