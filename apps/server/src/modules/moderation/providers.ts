// Which AI checks new text for safety. MODERATION_PROVIDER picks one:
//   openai  OpenAI's moderation endpoint (omni-moderation-latest), needs OPENAI_API_KEY
//   claude  Claude with a JSON answer in OpenAI's category names, needs ANTHROPIC_API_KEY
//   local   a model on your own Apple-silicon Mac through Ollama, needs LOCAL_MODEL_URL;
//           the text never leaves your hardware (docs/LOCAL_MODERATION.md)
//   off     no AI check (reports from members still work)
// A provider whose key (or URL) isn't set is off, so nothing is sent anywhere until one is added.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { Config } from '../../config.js';
import { openAiClassifier, type Classifier } from './index.js';

/** The categories the rest of moderation understands (OpenAI's names; see AUTO_HIDE_CATEGORIES). */
export const CATEGORIES = [
  'harassment',
  'harassment/threatening',
  'hate',
  'hate/threatening',
  'illicit',
  'illicit/violent',
  'self-harm',
  'self-harm/intent',
  'self-harm/instructions',
  'sexual',
  'sexual/minors',
  'violence',
  'violence/graphic',
] as const;

const Verdict = z.object({
  flagged: z.boolean(),
  categories: z.array(z.enum(CATEGORIES)),
});

const SYSTEM = `You check posts in Prayer Tower, a Christian prayer community, for safety. Members ask for prayer about illness, grief, addiction, abuse, depression and death, and often describe hard things plainly. Talking about suffering, sin or temptation, quoting Scripture, or asking for prayer about violence or self-harm is not a violation in itself.

Flag text only when it does one of these: harasses, threatens or demeans a person or group; sexualizes anyone, or is sexual at all when it involves minors; gives instructions for self-harm or says the writer intends to harm themselves; promotes or helps with violence or crime; or describes violence in gratuitous, graphic detail.

Answer with flagged, and the categories that apply (an empty list when flagged is false). Use self-harm/intent when the writer says they plan or want to hurt or kill themselves, even in a prayer request, so a person can reach out.`;

export function claudeClassifier(config: Config, fetchImpl?: typeof fetch): Classifier {
  if (!config.ANTHROPIC_API_KEY) return async () => null;
  const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  return async (text) => {
    const res = await client.beta.messages.parse({
      model: config.MODERATION_CLAUDE_MODEL,
      max_tokens: 1024,
      output_config: { effort: 'low', format: betaZodOutputFormat(Verdict) },
      // If Claude's own safeguards decline the text, the API retries it on its recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: `<post>\n${text}\n</post>` }],
    });
    // A decline by every model means the text is far outside the rules: send it to a person.
    if (res.stop_reason === 'refusal') return { flagged: true, categories: { refused: true }, category_scores: {} };
    const verdict = res.parsed_output;
    if (!verdict) throw new Error(`moderation (Claude): no verdict, stop_reason ${res.stop_reason}`);
    const categories = Object.fromEntries(CATEGORIES.map((c) => [c, verdict.categories.includes(c)]));
    return { flagged: verdict.flagged && verdict.categories.length > 0, categories, category_scores: {} };
  };
}

/** A local model can be slow on a cold start; past this the check fails and the job retries. */
const LOCAL_TIMEOUT_MS = 60_000;
const VERDICT_SCHEMA = z.toJSONSchema(Verdict);

/**
 * Ollama's chat API with a JSON schema in `format` (structured outputs), temperature 0,
 * and the schema in the prompt as Ollama recommends (docs.ollama.com/capabilities/structured-outputs).
 */
export function localClassifier(config: Config, fetchImpl: typeof fetch = fetch): Classifier {
  if (!config.LOCAL_MODEL_URL) return async () => null;
  const url = new URL('/api/chat', config.LOCAL_MODEL_URL).toString();
  return async (text) => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(LOCAL_TIMEOUT_MS),
      body: JSON.stringify({
        model: config.LOCAL_MODERATION_MODEL,
        stream: false,
        format: VERDICT_SCHEMA,
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: `${SYSTEM}\n\nAnswer only with JSON that matches this schema: ${JSON.stringify(VERDICT_SCHEMA)}` },
          { role: 'user', content: `<post>\n${text}\n</post>` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`moderation (local) ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { message?: { content?: string } };
    const parsed = Verdict.safeParse(JSON.parse(json.message?.content ?? 'null'));
    if (!parsed.success) throw new Error('moderation (local): the model did not return a verdict');
    const categories = Object.fromEntries(CATEGORIES.map((c) => [c, parsed.data.categories.includes(c)]));
    return { flagged: parsed.data.flagged && parsed.data.categories.length > 0, categories, category_scores: {} };
  };
}

/** The classifier MODERATION_PROVIDER names. */
export function createClassifier(config: Config, fetchImpl?: typeof fetch): Classifier {
  switch (config.MODERATION_PROVIDER) {
    case 'claude':
      return claudeClassifier(config, fetchImpl);
    case 'openai':
      return openAiClassifier(config, fetchImpl);
    case 'local':
      return localClassifier(config, fetchImpl);
    default:
      return async () => null;
  }
}
