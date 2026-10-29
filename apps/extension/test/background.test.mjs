// background.js: sends each captured post once, queues it when the server can't be
// reached, retries it on the alarm, and gives up after a day.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const code = readFileSync(join(import.meta.dirname, '..', 'src', 'background.js'), 'utf8');
const post = { source: 'facebook', text: 'Thank you all for praying', media: [] };

/** Loads background.js with a fake chrome API; fetch answers from `answers` in turn. */
function load(stored = {}, answers = []) {
  const store = { server: 'https://api.example.org/', key: 'ptx_k', ...stored };
  const listeners = {};
  const on = (name) => ({ addListener: (fn) => (listeners[name] = fn) });
  const chrome = {
    storage: {
      local: {
        get: async (q) => {
          if (typeof q === 'string') return q in store ? { [q]: store[q] } : {};
          return Object.fromEntries(Object.entries(q).map(([k, d]) => [k, k in store ? store[k] : d]));
        },
        set: async (o) => Object.assign(store, o),
      },
    },
    runtime: { onMessage: on('message'), onInstalled: on('installed'), openOptionsPage: vi.fn() },
    alarms: { create: vi.fn(), onAlarm: on('alarm') },
    // No action: as in Safari on iPhone, which has no toolbar badge.
  };
  const fetch = vi.fn(async () => {
    const a = answers.shift();
    if (a instanceof Error) throw a;
    return { ok: a.status < 300, status: a.status, json: async () => a.body ?? {} };
  });
  runInNewContext(code, { chrome, fetch, Date, JSON, Promise });
  const settle = () => new Promise((r) => setTimeout(r, 10));
  return { store, fetch, listeners, settle, chrome };
}

describe('background', () => {
  it('sends the post with the key and logs the result', async () => {
    const bg = load({}, [{ status: 201, body: { status: 'posted' } }]);
    bg.listeners.message({ type: 'crosspost', post });
    await bg.settle();
    expect(bg.fetch).toHaveBeenCalledWith('https://api.example.org/crosspost/extension/posts', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'x-crosspost-key': 'ptx_k' }) }));
    expect(JSON.parse(bg.fetch.mock.calls[0][1].body)).toEqual(post);
    expect(bg.store.recent[0]).toMatchObject({ ok: true, message: 'Copied to your account' });
    expect(bg.store.queue).toBeUndefined();
    expect(bg.chrome.alarms.create).toHaveBeenCalledWith('crosspost-retry', { periodInMinutes: 1 });
  });

  it('queues when offline or the server is down, and sends on the next alarm', async () => {
    const bg = load({}, [new TypeError('offline'), { status: 503 }, { status: 200, body: { status: 'duplicate' } }]);
    bg.listeners.message({ type: 'crosspost', post });
    await bg.settle();
    expect(bg.store.queue).toHaveLength(1);
    expect(bg.store.recent[0].message).toMatch(/retry/);
    bg.listeners.alarm({ name: 'crosspost-retry' });
    await bg.settle();
    expect(bg.store.queue).toHaveLength(1);
    bg.listeners.alarm({ name: 'crosspost-retry' });
    await bg.settle();
    expect(bg.store.queue).toEqual([]);
    expect(bg.store.recent[0].message).toBe('Already copied');
  });

  it('does not retry a post the server refused, and drops posts older than a day', async () => {
    const bg = load({ queue: [{ post, at: Date.now() - 25 * 3600_000 }] }, [{ status: 401, body: { message: 'That key is not valid' } }]);
    bg.listeners.message({ type: 'crosspost', post });
    await bg.settle();
    expect(bg.store.recent[0]).toMatchObject({ ok: false, message: 'That key is not valid' });
    bg.listeners.alarm({ name: 'crosspost-retry' });
    await bg.settle();
    expect(bg.fetch).toHaveBeenCalledTimes(1);
    expect(bg.store.queue).toEqual([]);
  });

  it('sends nothing when turned off or not set up', async () => {
    const off = load({ enabled: false });
    off.listeners.message({ type: 'crosspost', post });
    await off.settle();
    expect(off.fetch).not.toHaveBeenCalled();
    const unset = load({ key: '' });
    unset.listeners.message({ type: 'crosspost', post });
    await unset.settle();
    expect(unset.fetch).not.toHaveBeenCalled();
    expect(unset.store.recent[0].message).toMatch(/add your server and key/);
  });

  it('opens the settings page on install', () => {
    const bg = load();
    bg.listeners.installed({ reason: 'install' });
    expect(bg.chrome.runtime.openOptionsPage).toHaveBeenCalled();
  });
});
