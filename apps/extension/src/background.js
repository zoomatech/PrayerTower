// Sends captured posts to the member's Prayer Tower server with their key
// (settings in options.html). A post that can't be sent (no signal, server
// down) waits in a queue and is retried every minute for a day.

const QUEUE_HOURS = 24;

async function settings() {
  const s = await chrome.storage.local.get({ server: '', key: '', enabled: true });
  return { server: s.server.replace(/\/+$/, ''), key: s.key, enabled: s.enabled };
}

async function log(entry) {
  const { recent = [] } = await chrome.storage.local.get('recent');
  await chrome.storage.local.set({ recent: [{ ...entry, at: Date.now() }, ...recent].slice(0, 20) });
  chrome.action.setBadgeText({ text: entry.ok ? '' : '!' });
  if (!entry.ok) chrome.action.setBadgeBackgroundColor({ color: '#b45309' });
}

/** true when sent (or refused for good), false when it should be tried again later. */
async function send(post) {
  const s = await settings();
  if (!s.enabled) return true;
  if (!s.server || !s.key) {
    await log({ ok: false, source: post.source, message: 'Open the extension settings and add your server and key.' });
    return true;
  }
  let res;
  try {
    res = await fetch(`${s.server}/crosspost/extension/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-crosspost-key': s.key },
      body: JSON.stringify(post),
    });
  } catch {
    return false;
  }
  if (res.status >= 500 || res.status === 429) return false;
  const body = await res.json().catch(() => ({}));
  if (res.ok) await log({ ok: true, source: post.source, message: body.status === 'posted' ? 'Copied to Prayer Tower' : body.status === 'duplicate' ? 'Already copied' : `Not copied: ${body.reason ?? ''}` });
  else await log({ ok: false, source: post.source, message: body.message || `Prayer Tower answered ${res.status}` });
  return true;
}

async function enqueue(post) {
  const { queue = [] } = await chrome.storage.local.get('queue');
  await chrome.storage.local.set({ queue: [...queue, { post, at: Date.now() }].slice(-20) });
  await log({ ok: false, source: post.source, message: 'Waiting to send (will retry)' });
}

async function retryQueue() {
  const { queue = [] } = await chrome.storage.local.get('queue');
  const left = [];
  for (const item of queue) {
    if (Date.now() - item.at > QUEUE_HOURS * 3600_000) continue;
    if (!(await send(item.post))) left.push(item);
  }
  await chrome.storage.local.set({ queue: left });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'crosspost' && msg.post) {
    send(msg.post).then((done) => (done ? undefined : enqueue(msg.post)));
  }
});

chrome.alarms.create('crosspost-retry', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => a.name === 'crosspost-retry' && retryQueue());
chrome.runtime.onInstalled.addListener((d) => d.reason === 'install' && chrome.runtime.openOptionsPage());
