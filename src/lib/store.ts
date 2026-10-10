import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEMO_CONFIG, DEMO_NOW, fixtureRunner } from "@/demo/fixtures";
import { buildCards } from "@/engine/engine";
import { FALLBACK_PRICES } from "@/engine/signals";
import type { Card, Product } from "@/engine/types";

export const isDemo = (): boolean => process.env.NEXT_PUBLIC_DEMO === "1";

/** Folder the CLI and the web UI write cards to. CARDS_DIR overrides it. */
export const cardsDir = (): string => resolve(/*turbopackIgnore: true*/ process.env.CARDS_DIR ?? "cards");

export interface Loaded {
  product: Product;
  cards: Card[];
}

/** Cards for the UI: the sample data in demo mode, the files in the cards folder otherwise. Empty when nothing was built yet. */
export async function loadCards(): Promise<Loaded> {
  if (isDemo()) {
    const r = await buildCards(DEMO_CONFIG, { looot: fixtureRunner, prices: FALLBACK_PRICES, now: DEMO_NOW });
    return { product: DEMO_CONFIG.product, cards: r.cards };
  }
  const dir = cardsDir();
  if (!existsSync(dir)) return { product: { name: "Your product", strengths: [] }, cards: [] };
  const product: Product = existsSync(join(dir, "product.json")) ? JSON.parse(readFileSync(join(dir, "product.json"), "utf8")) : { name: "Your product", strengths: [] };
  const cards = readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "product.json")
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Card)
    .sort((a, b) => a.competitor.name.localeCompare(b.competitor.name));
  return { product, cards };
}
