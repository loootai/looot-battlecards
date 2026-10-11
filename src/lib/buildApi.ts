import { buildConfig, ConfigError } from "@/engine/config";
import { quoteOf, type Quote } from "@/engine/engine";
import { FALLBACK_PRICES } from "@/engine/signals";
import type { BattlecardConfig } from "@/engine/types";
import { serverCapMicros } from "@/lib/auth/serverCap";
import { fetchPrices } from "@/lib/prices";
import type { PriceMap } from "@/lib/spender";
import { isDemo } from "@/lib/store";

/**
 * What the caller may send. There is no cap field: the spend cap is server config
 * (BATTLECARDS_MAX_SPEND_USD) and anything a caller sends for it is ignored.
 * confirmedMaxUsd is the amount the person agreed to after the quote. It can lower the spend, never raise the cap.
 */
export interface PlanRequest {
  product?: string;
  strengths?: string[];
  competitors?: string[];
  signals?: string[];
  confirmedMaxUsd?: number;
  quoteToken?: string;
}

export interface Planned {
  config: BattlecardConfig;
  quote: Quote;
  prices: PriceMap;
  unread: string[];
  source: "catalog" | "fallback";
}

export const MAX_PRODUCT_CHARS = 100;
export const MAX_STRENGTHS = 10;
export const MAX_STRENGTH_CHARS = 200;

/** Validates a request body and prices it under the server's cap. Free: the public catalog needs no token. Throws ConfigError on bad input. */
export async function planFromRequest(body: PlanRequest): Promise<Planned> {
  if (!body || typeof body !== "object") throw new ConfigError("Send a JSON object.");
  if (typeof body.product === "string" && body.product.length > MAX_PRODUCT_CHARS) throw new ConfigError(`product is at most ${MAX_PRODUCT_CHARS} characters.`);
  if (body.strengths !== undefined && (!Array.isArray(body.strengths) || body.strengths.length > MAX_STRENGTHS || body.strengths.some((s) => typeof s !== "string" || s.length > MAX_STRENGTH_CHARS))) {
    throw new ConfigError(`strengths is at most ${MAX_STRENGTHS} lines of ${MAX_STRENGTH_CHARS} characters.`);
  }
  const config = buildConfig({ product: { name: body.product, strengths: body.strengths }, competitors: body.competitors, signals: body.signals });
  config.maxSpendMicros = serverCapMicros();
  const priced = isDemo() ? { prices: FALLBACK_PRICES, source: "fallback" as const, unread: [] as string[] } : await fetchPrices(FALLBACK_PRICES);
  return { config, quote: quoteOf(config, priced.prices), prices: priced.prices, unread: priced.unread, source: priced.source };
}

export { ConfigError };
