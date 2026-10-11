"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "./adminFetch";

interface QuoteAnswer {
  totalMicros: number;
  capMicros: number;
  overCap: boolean;
  calls: number;
  lines: { endpointId: string; calls: number; priceMicros: number }[];
  priceSource: string;
  unread: string[];
  quoteToken?: string | null;
  error?: string;
}

const usd = (micros: number) => `$${(micros / 1e6).toFixed(micros % 100 === 0 ? 4 : 5)}`;

/** Asks for a quote first (free). The build button appears only after a quote, and sends the quoted total as the confirmed maximum. */
export function BuildForm() {
  const router = useRouter();
  const [product, setProduct] = useState("");
  const [strengths, setStrengths] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [quote, setQuote] = useState<QuoteAnswer | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const payload = () => ({
    product,
    strengths: strengths.split("\n").map((s) => s.trim()).filter(Boolean),
    competitors: competitors.split(/[\s,]+/).filter(Boolean),
  });

  async function getQuote() {
    setBusy(true);
    setMessage(null);
    const res = await adminFetch("/api/quote", { method: "POST", body: JSON.stringify(payload()) });
    const json = (await res.json()) as QuoteAnswer;
    setBusy(false);
    if (!res.ok) {
      setQuote(null);
      return setMessage(json.error ?? "Could not get a quote.");
    }
    setQuote(json);
  }

  async function build() {
    if (!quote) return;
    setBusy(true);
    const res = await adminFetch("/api/build", { method: "POST", body: JSON.stringify({ ...payload(), confirmedMaxUsd: quote.totalMicros / 1e6, quoteToken: quote.quoteToken }) });
    const json = (await res.json()) as { error?: string; message?: string; cards?: number; chargedMicros?: number };
    setBusy(false);
    if (!res.ok) return setMessage(json.error ?? "Build failed.");
    if (json.message) return setMessage(json.message);
    router.push("/");
    router.refresh();
  }

  const field = "mt-1 w-full rounded-control border border-line bg-panel px-3 py-2 text-14";
  return (
    <div className="space-y-4">
      <label className="block text-13">Your product
        <input className={field} value={product} onChange={(e) => { setProduct(e.target.value); setQuote(null); }} placeholder="Tallyroom" />
      </label>
      <label className="block text-13">Competitor domains (1 to 10, comma or line separated)
        <textarea className={field} rows={3} value={competitors} onChange={(e) => { setCompetitors(e.target.value); setQuote(null); }} placeholder="ledgerly.com, paperkite.io" />
      </label>
      <label className="block text-13">Where you win (one per line, optional, shown as your own words)
        <textarea className={field} rows={2} value={strengths} onChange={(e) => setStrengths(e.target.value)} />
      </label>
      <button onClick={getQuote} disabled={busy} className="rounded-control border border-line bg-panel px-4 py-2 text-14 hover:bg-hover">Get a quote (free)</button>
      {message && <p role="status" className="text-14 text-medium">{message}</p>}
      {quote && (
        <div className="rounded-panel border border-line bg-panel p-4 text-14">
          <p className="font-semibold">This run costs up to <span className="num">{usd(quote.totalMicros)}</span> for {quote.calls} calls.</p>
          <ul className="mt-2 space-y-1 text-13 text-mute">
            {quote.lines.map((l) => <li key={l.endpointId} className="num">{l.calls} x {l.endpointId} at {usd(l.priceMicros)}</li>)}
          </ul>
          <p className="mt-2 text-12 text-mute">Cap per build: {usd(quote.capMicros)}, set on the server. {quote.priceSource === "catalog" ? "Live prices from the looot catalog." : "List prices dated 2026-10-10 (the catalog was not read)."}</p>
          {quote.overCap && <p className="mt-2 text-medium">Over the cap of {usd(quote.capMicros)} per build. Calls that do not fit will be skipped and marked on the card.</p>}
          <button onClick={build} disabled={busy} className="mt-3 rounded-control bg-brand px-4 py-2 text-14 text-brand-ink">Build for up to {usd(quote.totalMicros)}</button>
        </div>
      )}
    </div>
  );
}
