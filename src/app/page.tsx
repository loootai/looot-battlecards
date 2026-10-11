import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guard";
import { usdPrecise } from "@/lib/money";
import { loadCards } from "@/lib/store";
import type { Card, SignalId } from "@/engine/types";

export const dynamic = "force-dynamic";

const first = (card: Card, signal: SignalId, n = 1) => card.sections.find((s) => s.signal === signal)?.claims.slice(0, n).map((c) => c.text) ?? [];

export default async function Home() {
  await requireAdminPage();
  const { product, cards } = await loadCards();
  if (cards.length === 0) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-20 font-semibold">No battlecards yet</h1>
        <p className="mt-2 text-mute">
          Run <code className="num rounded bg-hover px-1">npm run cards -- --demo</code> or use the <Link href="/build" className="text-link underline">Build page</Link>.
        </p>
      </div>
    );
  }
  const total = cards.reduce((n, c) => n + c.costMicros, 0);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-20 font-semibold">Battlecards for {product.name}</h1>
        <p className="mt-1 text-mute">
          {cards.length} competitors, fetched {cards[0].generatedAt.slice(0, 10)}. Charged by looot: <span className="num">{usdPrecise(total)}</span>.
        </p>
      </div>
      <div className="overflow-x-auto rounded-panel border border-line bg-panel">
        <table className="w-full text-left text-13">
          <thead className="border-b border-line text-mute">
            <tr>
              <th className="p-3 font-medium">Competitor</th>
              <th className="p-3 font-medium">Pricing</th>
              <th className="p-3 font-medium">Hiring</th>
              <th className="p-3 font-medium">Latest news</th>
              <th className="p-3 font-medium">Sections</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.competitor.domain} className="border-b border-line align-top last:border-0">
                <td className="p-3">
                  <Link href={`/card/${c.competitor.domain}`} className="font-medium text-link underline">{c.competitor.name}</Link>
                  <div className="text-12 text-mute">{c.competitor.domain}</div>
                </td>
                <td className="p-3">{first(c, "pricing", 2).join("; ") || <span className="text-mute">none</span>}</td>
                <td className="p-3">{first(c, "hiring", 2)[1] ?? <span className="text-mute">none</span>}</td>
                <td className="p-3">{first(c, "news")[0] ?? <span className="text-mute">none</span>}</td>
                <td className="p-3 num">{c.sections.filter((s) => s.claims.length > 0).length} of {c.sections.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-13 text-mute">
        For alerts when a competitor page changes, use <a className="text-link underline" href="https://github.com/loootai/looot-monitor">looot-monitor</a>.
      </p>
    </div>
  );
}
