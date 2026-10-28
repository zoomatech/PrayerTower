// The API client: sign-in token, error messages, and what happens with no signal
// (the last feed is shown, and prayers and posts wait in a queue).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook } from '@testing-library/react-native';

import * as client from '@/lib/api';
import * as offline from '@/lib/offline';

const fetchMock = jest.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

const ok = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
const noSignal = () => Promise.reject(new TypeError('Network request failed'));

beforeEach(async () => {
  // Start every test online, with nothing saved or queued.
  await offline.clearOffline();
  offline.markOnline(true);
  await AsyncStorage.clear();
  fetchMock.mockReset();
});

/** Let fire-and-forget work (sending the queue) finish. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('requests', () => {
  it('sends the sign-in token to the API', async () => {
    fetchMock.mockReturnValueOnce(ok({ features: {} }));
    await client.api.features();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/features');
    expect(init.headers.authorization).toBe('Bearer test-token');
  });

  it('turns a refusal into an ApiError with the server\'s message', async () => {
    fetchMock.mockReturnValueOnce(ok({ error: 'forbidden', message: 'Only the requester can do that' }, 403));
    const err = await client.api.features().catch((e) => e);
    expect(err).toBeInstanceOf(client.ApiError);
    expect(err.status).toBe(403);
    expect(err.message).toBe('Only the requester can do that');
  });

  it('shows the first validation issue rather than a generic message', async () => {
    fetchMock.mockReturnValueOnce(ok({ error: 'bad_request', message: 'Invalid', issues: [{ message: 'Your post is empty' }] }, 400));
    await expect(client.api.commit('p1', { frequency: 'daily', vowText: '' })).rejects.toThrow('Your post is empty');
  });
});

describe('no signal', () => {
  it('shows the last feed it saw, marked with when it was saved', async () => {
    const page = { posts: [{ id: 'p1' }], nextPage: 1, pinnedId: null };
    fetchMock.mockReturnValueOnce(ok(page));
    await client.api.feed();
    await settle();
    fetchMock.mockImplementationOnce(noSignal);
    const saved = await client.api.feed();
    expect(saved.posts).toEqual(page.posts);
    expect(typeof saved.savedAt).toBe('number');
  });

  it('says it is offline when there is no saved feed', async () => {
    fetchMock.mockImplementationOnce(noSignal);
    const err = await client.api.feed().catch((e) => e);
    expect(offline.isOffline(err)).toBe(true);
  });

  it('queues a prayer and sends it once the server can be reached', async () => {
    fetchMock.mockImplementationOnce(noSignal);
    await expect(client.api.prayingNow('p1')).resolves.toEqual({ queued: true });
    // The next successful call sends the waiting prayer.
    fetchMock.mockReturnValue(ok({}));
    await client.api.features();
    await settle();
    await settle();
    const sent = fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url}`);
    expect(sent).toContain('POST http://localhost:3000/posts/p1/praying-now');
    expect(JSON.parse((await AsyncStorage.getItem('offline:queue:v1')) ?? '[]')).toEqual([]);
  });

  it('does not queue a refusal: the member sees the reason now', async () => {
    fetchMock.mockReturnValueOnce(ok({ message: 'This request was removed' }, 404));
    await expect(client.api.prayingNow('p1')).rejects.toThrow('This request was removed');
    expect(await AsyncStorage.getItem('offline:queue:v1')).toBeNull();
  });
});

describe('the offline queue', () => {
  const action = { method: 'POST' as const, path: '/posts', body: { body: 'hi' }, label: 'Your post' };

  it('keeps an action when the server is down and tries again later', async () => {
    await offline.enqueue(action);
    await offline.flushQueue(async () => {
      throw Object.assign(new Error('Server error'), { status: 503 });
    });
    const queued = JSON.parse((await AsyncStorage.getItem('offline:queue:v1')) ?? '[]');
    expect(queued).toHaveLength(1);
  });

  it('drops an action the server refuses and says why', async () => {
    await offline.enqueue(action);
    await offline.flushQueue(async () => {
      throw Object.assign(new Error('Your post is too long'), { status: 400 });
    });
    expect(JSON.parse((await AsyncStorage.getItem('offline:queue:v1')) ?? '[]')).toEqual([]);
    const { result } = await renderHook(() => offline.useOffline());
    expect(result.current.dropped).toEqual(['Your post: Your post is too long']);
  });

  it('sends queued actions in the order they were made', async () => {
    await offline.enqueue({ ...action, path: '/first' });
    await offline.enqueue({ ...action, path: '/second' });
    const order: string[] = [];
    await offline.flushQueue(async (a) => order.push(a.path));
    expect(order).toEqual(['/first', '/second']);
  });

  it('forgets everything on sign-out', async () => {
    await offline.enqueue(action);
    await offline.saveCached('feed', { posts: [] });
    await offline.clearOffline();
    const keys = await AsyncStorage.getAllKeys();
    expect(keys.filter((k) => k.startsWith('offline:'))).toEqual([]);
  });
});
