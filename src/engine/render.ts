import { usdPrecise } from "@/lib/money";
import type { Card, Product, Section } from "./types";

const day = (iso: string) => iso.slice(0, 10);

const STATUS_NOTE: Record<Section["status"], string> = {
  ok: "",
  empty: "Nothing found",
  pending: "Still running at looot, not failed",
  failed: "The call failed (no charge)",
  skipped: "Skipped",
  not_run: "Not run",
};

/** One battlecard as markdown. Every claim ends with its source link and fetch date. */
export function cardMarkdown(card: Card, product: Product): string {
  const out: string[] = [`# ${card.competitor.name} (${card.competitor.domain})`, "", `Battlecard for ${product.name}. Fetched ${day(card.generatedAt)}. Charged by looot for this card: ${usdPrecise(card.costMicros)}.`, ""];
  if (card.summary) out.push("## Summary (written by a model from the claims below)", "", card.summary.text, "", `_Model ${card.summary.model}, ${day(card.summary.generatedAt)}. Not a sourced claim._`, "");
  for (const s of card.sections) {
    out.push(`## ${s.title}`, "");
    if (s.claims.length === 0) out.push(`_${STATUS_NOTE[s.status]}${s.note ? `: ${s.note}` : ""}_`, "");
    else {
      for (const c of s.claims) out.push(`- ${c.text} ([source](${c.sourceUrl}), ${day(c.fetchedAt)}, ${c.via})`);
      if (s.note) out.push("", `_${s.note}_`);
      out.push("");
    }
  }
  if (product.strengths.length > 0) {
    out.push(`## Where ${product.name} wins (written by you, not fetched)`, "", ...product.strengths.map((t) => `- ${t}`), "");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

/** The index file that lists every card. */
export function indexMarkdown(cards: Card[], product: Product, totalMicros: number): string {
  const rows = cards.map((c) => `- [${c.competitor.name}](${c.competitor.domain}.md): ${c.sections.filter((s) => s.claims.length > 0).length} of ${c.sections.length} sections filled`);
  return `# Battlecards for ${product.name}\n\nBuilt ${day(cards[0]?.generatedAt ?? new Date().toISOString())}. Charged by looot: ${usdPrecise(totalMicros)}.\n\n${rows.join("\n")}\n`;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One battlecard as a single self-contained HTML page with print styles, ready for "Save as PDF". */
export function cardHtml(card: Card, product: Product): string {
  const sections = card.sections
    .map((s) => {
      const body =
        s.claims.length === 0
          ? `<p class="none">${esc(STATUS_NOTE[s.status])}${s.note ? `: ${esc(s.note)}` : ""}</p>`
          : `<ul>${s.claims.map((c) => `<li>${esc(c.text)} <span class="src"><a href="${esc(c.sourceUrl)}">source</a>, ${day(c.fetchedAt)}</span></li>`).join("")}</ul>${s.note ? `<p class="none">${esc(s.note)}</p>` : ""}`;
      return `<section><h2>${esc(s.title)}</h2>${body}</section>`;
    })
    .join("");
  const summary = card.summary ? `<section class="llm"><h2>Summary</h2><p>${esc(card.summary.text)}</p><p class="none">Written by ${esc(card.summary.model)} from the claims below. Not a sourced claim.</p></section>` : "";
  const wins = product.strengths.length > 0 ? `<section><h2>Where ${esc(product.name)} wins</h2><ul>${product.strengths.map((t) => `<li>${esc(t)}</li>`).join("")}</ul><p class="none">Written by you, not fetched.</p></section>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(card.competitor.name)} battlecard</title>
<style>
:root{--ink:#0B2E22;--brand:#0B4A35;--accent:#12A06A;--page:#F7F8F5;--mute:#5c6f66}
body{font:14px/1.5 system-ui,sans-serif;color:var(--ink);background:var(--page);margin:0;padding:32px}
main{max-width:780px;margin:0 auto;background:#fff;border:1px solid #e3e7df;border-radius:8px;padding:28px 32px}
h1{font-size:22px;margin:0;color:var(--brand)} .meta{color:var(--mute);margin:4px 0 20px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--brand);border-bottom:2px solid var(--accent);padding-bottom:4px;margin:22px 0 8px}
ul{margin:0;padding-left:18px} li{margin:4px 0} .src{color:var(--mute);font-size:12px} .src a{color:var(--brand)} .none{color:var(--mute);font-style:italic}
.llm{background:#eef6f1;padding:4px 14px;border-radius:6px}
@media print{body{background:#fff;padding:0} main{border:0;padding:0} section{break-inside:avoid}}
</style></head><body><main>
<h1>${esc(card.competitor.name)} <span class="src">${esc(card.competitor.domain)}</span></h1>
<p class="meta">Battlecard for ${esc(product.name)}. Fetched ${day(card.generatedAt)}. Charged by looot for this card: ${usdPrecise(card.costMicros)}.</p>
${summary}${sections}${wins}
</main></body></html>
`;
}
