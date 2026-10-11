import { ConfigError } from "@/engine/config";
import type { Env } from "./policy";

/** Spend cap per web build when the server sets none: 1 dollar. */
export const DEFAULT_SERVER_CAP_USD = 1;

/**
 * The spend cap for a web build, in micro-dollars. Read from BATTLECARDS_MAX_SPEND_USD on the server.
 * The caller never sets it. A value that is not a positive number throws, so a typo cannot lift the cap.
 */
export function serverCapMicros(env: Env = process.env): number {
  const raw = env.BATTLECARDS_MAX_SPEND_USD?.trim();
  if (!raw) return Math.round(DEFAULT_SERVER_CAP_USD * 1_000_000);
  const usd = Number(raw);
  if (!Number.isFinite(usd) || usd <= 0) throw new ConfigError("BATTLECARDS_MAX_SPEND_USD on the server must be a positive number of dollars.");
  return Math.round(usd * 1_000_000);
}
