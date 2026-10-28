import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createConverser } from '../src/modules/ai/provider.js';

const base = loadConfig();

function fakeFetch(answer: object) {
  const calls: { url: string; body: any; headers: Headers }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { f, calls };
}

const message = (stop_reason: string, text?: string) => ({
  id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason, stop_sequence: null,
  content: text ? [{ type: 'text', text }] : [],
  usage: { input_tokens: 10, output_tokens: 10 },
});

describe('AI conversation provider', () => {
  it('is off without ANTHROPIC_API_KEY', () => {
    expect(createConverser({ ...base, ANTHROPIC_API_KEY: undefined })).toBeNull();
  });

  it('calls Claude with the system prompt, low effort and refusal fallbacks', async () => {
    const { f, calls } = fakeFetch(message('end_turn', 'Peace be with you.'));
    const converse = createConverser({ ...base, ANTHROPIC_API_KEY: 'sk-ant-test' }, f)!;
    expect(await converse('SYSTEM', [{ role: 'user', content: 'Hello' }])).toEqual({ text: 'Peace be with you.' });
    expect(calls[0]!.url).toMatch(/\/v1\/messages/);
    expect(calls[0]!.body).toMatchObject({
      model: 'claude-opus-5-5',
      system: 'SYSTEM',
      fallbacks: 'default',
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(calls[0]!.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
  });

  it('reports a refusal instead of an empty reply', async () => {
    const { f } = fakeFetch(message('refusal'));
    const converse = createConverser({ ...base, ANTHROPIC_API_KEY: 'k' }, f)!;
    expect(await converse('S', [{ role: 'user', content: 'x' }])).toEqual({ refused: true });
  });
});
