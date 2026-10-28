// The AI behind the "not God" conversation and the circle facilitator: Claude
// through Anthropic's API. Without ANTHROPIC_API_KEY there is no AI, and both
// features answer with a fixed message instead. Nothing a member writes is stored.
import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../../config.js';

export type Turn = { role: 'user' | 'assistant'; content: string };
/** One AI reply, or `refused` when every model declined (the member gets a fixed, kind answer). */
export type Converse = (system: string, turns: Turn[]) => Promise<{ text: string } | { refused: true }>;

export function createConverser(config: Config, fetchImpl?: typeof fetch): Converse | null {
  if (!config.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  return async (system, turns) => {
    const res = await client.beta.messages.create({
      model: config.AI_CHAT_MODEL,
      max_tokens: 4096,
      // Short, warm replies: low effort keeps them quick and inexpensive.
      output_config: { effort: 'low' },
      // If Claude's own safeguards decline, the API retries on its recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: turns,
    });
    if (res.stop_reason === 'refusal') return { refused: true };
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!text) throw new Error(`AI conversation: no text, stop_reason ${res.stop_reason}`);
    return { text };
  };
}
