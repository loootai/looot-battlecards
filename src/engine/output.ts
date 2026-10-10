import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cardHtml, cardMarkdown, indexMarkdown } from "./render";
import type { Card, Product } from "./types";

/** Writes <domain>.json, .md and .html per card, plus index.md and product.json, into one folder. */
export function writeOutputs(out: string, cards: Card[], product: Product, chargedMicros: number): void {
  mkdirSync(out, { recursive: true });
  for (const c of cards) {
    const base = join(out, c.competitor.domain);
    writeFileSync(`${base}.json`, `${JSON.stringify(c, null, 1)}\n`);
    writeFileSync(`${base}.md`, cardMarkdown(c, product));
    writeFileSync(`${base}.html`, cardHtml(c, product));
  }
  writeFileSync(join(out, "product.json"), `${JSON.stringify(product, null, 1)}\n`);
  writeFileSync(join(out, "index.md"), indexMarkdown(cards, product, chargedMicros));
}
