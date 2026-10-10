import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionView } from "@/components/Section";
import { usdPrecise } from "@/lib/money";
import { loadCards } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function CardPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const { product, cards } = await loadCards();
  const card = cards.find((c) => c.competitor.domain === domain);
  if (!card) notFound();
  return (
    <div className="space-y-4">
      <Link href="/" className="text-13 text-mute hover:text-ink">All battlecards</Link>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-20 font-semibold">{card.competitor.name}</h1>
          <p className="text-mute">{card.competitor.domain}. Fetched {card.generatedAt.slice(0, 10)}. Charged by looot: <span className="num">{usdPrecise(card.costMicros)}</span>.</p>
        </div>
        <div className="ml-auto flex gap-2 text-13">
          <a className="rounded-control border border-line px-3 py-1.5 hover:bg-hover" href={`/api/export/${domain}?format=md`}>Markdown</a>
          <a className="rounded-control border border-line px-3 py-1.5 hover:bg-hover" href={`/api/export/${domain}?format=html`} target="_blank">PDF-ready HTML</a>
        </div>
      </div>
      {card.summary && (
        <section className="rounded-panel border border-line bg-brand-soft p-4">
          <h2 className="text-14 font-semibold">Summary</h2>
          <p className="mt-1 text-14">{card.summary.text}</p>
          <p className="mt-1 text-12 text-mute">Written by {card.summary.model} from the claims below. Not a sourced claim.</p>
        </section>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {card.sections.map((s) => (
          <SectionView key={s.signal} section={s} />
        ))}
      </div>
      {product.strengths.length > 0 && (
        <section className="rounded-panel border border-line bg-panel p-4">
          <h2 className="text-14 font-semibold">Where {product.name} wins</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-14">
            {product.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="mt-2 text-12 text-mute">Written by you, not fetched.</p>
        </section>
      )}
    </div>
  );
}
