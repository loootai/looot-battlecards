import { cardHtml, cardMarkdown } from "@/engine/render";
import { loadCards } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Free. Downloads one card as markdown or PDF-ready HTML. */
export async function GET(req: Request, ctx: { params: Promise<{ domain: string }> }) {
  const { domain } = await ctx.params;
  const format = new URL(req.url).searchParams.get("format") === "html" ? "html" : "md";
  const { product, cards } = await loadCards();
  const card = cards.find((c) => c.competitor.domain === domain);
  if (!card) return Response.json({ error: "No such card." }, { status: 404 });
  return format === "html"
    ? new Response(cardHtml(card, product), { headers: { "content-type": "text/html; charset=utf-8" } })
    : new Response(cardMarkdown(card, product), { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${domain}.md"` } });
}
