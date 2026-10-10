import type { Card } from "./types";

const DEFAULT_MODEL = "claude-sonnet-5-5";

/** true when the optional summary step can run: an Anthropic key is in the environment. */
export function summaryEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

/** The text the model sees: only the sourced claims of the card. */
export function summaryPrompt(card: Card): string {
  const body = card.sections
    .filter((s) => s.claims.length > 0)
    .map((s) => `${s.title}\n${s.claims.map((c) => `- ${c.text}`).join("\n")}`)
    .join("\n\n");
  return `Write a 3 sentence summary of ${card.competitor.name} for a sales team preparing to compete with them. Use only the facts below. Do not add anything that is not listed. Plain words, no hype.\n\n${body}`;
}

/**
 * Optional. Asks an LLM for a short summary of the already assembled card and stores it apart from the claims.
 * Needs ANTHROPIC_API_KEY. BATTLECARDS_LLM_MODEL overrides the model. Returns the card unchanged when the call fails.
 */
export async function addSummary(card: Card, opts: { env?: Record<string, string | undefined>; fetch?: typeof fetch; now?: Date } = {}): Promise<Card> {
  const env = opts.env ?? process.env;
  if (!env.ANTHROPIC_API_KEY) return card;
  const model = env.BATTLECARDS_LLM_MODEL ?? DEFAULT_MODEL;
  try {
    const res = await (opts.fetch ?? fetch)("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 400, messages: [{ role: "user", content: summaryPrompt(card) }] }),
    });
    if (!res.ok) return card;
    const body = (await res.json()) as { content?: { type?: string; text?: string }[] };
    const text = body.content?.find((b) => b.type === "text")?.text?.trim();
    if (!text) return card;
    return { ...card, summary: { text, model, generatedAt: (opts.now ?? new Date()).toISOString() } };
  } catch {
    return card;
  }
}
