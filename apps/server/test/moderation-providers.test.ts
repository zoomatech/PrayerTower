import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createClassifier } from '../src/modules/moderation/providers.js';

const base = loadConfig();
const config = (env: Partial<typeof base>) => ({ ...base, OPENAI_API_KEY: undefined, ANTHROPIC_API_KEY: undefined, ...env });

/** A fake provider: records each request and answers with the given JSON. */
function fakeFetch(answer: (body: any) => unknown) {
  const calls: { url: string; body: any }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(url), body });
    return new Response(JSON.stringify(answer(body)), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { f, calls };
}

const claudeAnswer = (verdict: object, stop_reason = 'end_turn') => () => ({
  id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason, stop_sequence: null,
  content: stop_reason === 'refusal' ? [] : [{ type: 'text', text: JSON.stringify(verdict) }],
  usage: { input_tokens: 10, output_tokens: 10 },
});

describe('moderation providers', () => {
  it('is off until the chosen provider has a key, and off means nothing is sent', async () => {
    for (const p of ['openai', 'claude', 'off'] as const) {
      const { f, calls } = fakeFetch(() => ({}));
      expect(await createClassifier(config({ MODERATION_PROVIDER: p }), f)('some text')).toBeNull();
      expect(calls).toHaveLength(0);
    }
    const { f, calls } = fakeFetch(() => ({}));
    expect(await createClassifier(config({ MODERATION_PROVIDER: 'off', OPENAI_API_KEY: 'k', ANTHROPIC_API_KEY: 'k' }), f)('x')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('openai: calls the moderation endpoint', async () => {
    const { f, calls } = fakeFetch(() => ({ results: [{ flagged: true, categories: { harassment: true }, category_scores: { harassment: 0.9 } }] }));
    const r = await createClassifier(config({ MODERATION_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' }), f)('mean words');
    expect(r?.flagged).toBe(true);
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/moderations');
  });

  it('claude: asks for a JSON verdict and maps it to the shared categories', async () => {
    const { f, calls } = fakeFetch(claudeAnswer({ flagged: true, categories: ['self-harm/intent'] }));
    const classify = createClassifier(config({ MODERATION_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'sk-ant-test' }), f);
    const r = await classify('I want to end it all tonight.');
    expect(r?.flagged).toBe(true);
    expect(r?.categories['self-harm/intent']).toBe(true);
    expect(r?.categories.harassment).toBe(false);
    expect(calls[0]!.url).toContain('/v1/messages');
    expect(calls[0]!.body.model).toBe('claude-opus-5-5');
    expect(calls[0]!.body.fallbacks).toBe('default');
    expect(calls[0]!.body.output_config.format.type).toBe('json_schema');
    expect(calls[0]!.body.messages[0].content).toContain('I want to end it all tonight.');
  });

  it('claude: a clean verdict is not flagged, and a refusal goes to a person', async () => {
    const ok = fakeFetch(claudeAnswer({ flagged: false, categories: [] }));
    expect((await createClassifier(config({ MODERATION_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' }), ok.f)('Please pray for my mom.'))?.flagged).toBe(false);
    const no = fakeFetch(claudeAnswer({}, 'refusal'));
    const r = await createClassifier(config({ MODERATION_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' }), no.f)('…');
    expect(r?.flagged).toBe(true);
    expect(r?.categories.refused).toBe(true);
  });
});
