import { createHash } from "node:crypto";
import type { BattlecardConfig } from "@/engine/types";
import type { Env } from "./policy";
import { signMessage, verifyMessage } from "./session";

/** A quote token is good for 10 minutes. */
export const QUOTE_TTL_SECONDS = 600;

/** A stable id for what a build would do: product, strengths, competitors, signals and the server cap. */
export function planKey(c: BattlecardConfig): string {
  const body = JSON.stringify([c.product.name, c.product.strengths, c.competitors.map((x) => [x.domain, x.name, x.pricingUrl ?? "", x.careersUrl ?? ""]), c.signals, c.maxSpendMicros]);
  return createHash("sha256").update(body).digest("hex");
}

/** Signs "this session was quoted this plan". Null when no signing key exists (open demo, which never spends). */
export async function issueQuoteToken(env: Env, sid: string, key: string, nowMs: number = Date.now()): Promise<string | null> {
  const exp = Math.floor(nowMs / 1000) + QUOTE_TTL_SECONDS;
  const sig = await signMessage(env, `q|${exp}|${sid}|${key}`);
  return sig ? `${exp}.${sig}` : null;
}

/** true when the token was issued to this session for exactly this plan and has not expired. */
export async function quoteTokenOk(env: Env, sid: string, key: string, token: unknown, nowMs: number = Date.now()): Promise<boolean> {
  if (typeof token !== "string" || token.length > 200) return false;
  const [expRaw, sig, extra] = token.split(".");
  if (!expRaw || !sig || extra !== undefined || !/^\d{1,12}$/.test(expRaw)) return false;
  const exp = Number(expRaw);
  if (exp * 1000 <= nowMs || exp * 1000 > nowMs + (QUOTE_TTL_SECONDS + 60) * 1000) return false;
  return verifyMessage(env, `q|${exp}|${sid}|${key}`, sig);
}
