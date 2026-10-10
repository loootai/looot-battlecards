import { buildConfig, ConfigError } from "@/engine/config";
import { quoteOf, type Quote } from "@/engine/engine";
import { FALLBACK_PRICES } from "@/engine/signals";
import type { BattlecardConfig } from "@/engine/types";
import { fetchPrices } from "@/lib/prices";
import type { PriceMap } from "@/lib/spender";
import { isDemo } from "@/lib/store";

export interface PlanRequest {
  product?: string;
  strengths?: string[];
  competitors?: string[];
  signals?: string[];
  maxSpendUsd?: number;
  confirmedMaxUsd?: number;
}

export interface Planned {
  config: BattlecardConfig;
  quote: Quote;
  prices: PriceMap;
  unread: string[];
  source: "catalog" | "fallback";
}

/** Validates a request body and prices it. Free: the public catalog needs no token. Throws ConfigError on bad input. */
export async function planFromRequest(body: PlanRequest): Promise<Planned> {
  const config = buildConfig({ product: { name: body.product, strengths: body.strengths }, competitors: body.competitors, signals: body.signals, maxSpendUsd: body.maxSpendUsd });
  const priced = isDemo() ? { prices: FALLBACK_PRICES, source: "fallback" as const, unread: [] as string[] } : await fetchPrices(FALLBACK_PRICES);
  return { config, quote: quoteOf(config, priced.prices), prices: priced.prices, unread: priced.unread, source: priced.source };
}

export { ConfigError };
