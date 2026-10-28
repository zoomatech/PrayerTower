// Settings: the member's server address and key, saved on this computer only.

const $ = (id) => document.getElementById(id);

async function load() {
  const s = await chrome.storage.local.get({ server: '', key: '', enabled: true, recent: [] });
  $('server').value = s.server;
  $('key').value = s.key;
  $('enabled').checked = s.enabled;
  $('recent').replaceChildren(
    ...s.recent.map((r) => {
      const li = document.createElement('li');
      li.className = r.ok ? 'ok' : 'bad';
      li.textContent = `${new Date(r.at).toLocaleString()} · ${r.source === 'threads' ? 'Threads' : 'Facebook'} · ${r.message}`;
      return li;
    }),
  );
  if (!s.recent.length) $('recent').textContent = 'Nothing sent yet.';
}

$('save').addEventListener('click', async () => {
  const status = $('status');
  let origin;
  try {
    const url = new URL($('server').value.trim());
    if (url.protocol !== 'https:') throw new Error('https');
    origin = url.origin;
  } catch {
    status.textContent = 'Enter the server address, starting with https://';
    return;
  }
  const key = $('key').value.trim();
  if (!/^ptx_[A-Za-z0-9_-]{43}$/.test(key)) {
    status.textContent = 'That key does not look right. Make a new one in the app.';
    return;
  }
  // The browser asks the member once to let the extension reach their server.
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] }).catch(() => false);
  if (!granted) {
    status.textContent = 'The extension needs permission to reach your server.';
    return;
  }
  await chrome.storage.local.set({ server: origin, key, enabled: $('enabled').checked });
  chrome.action.setBadgeText({ text: '' });
  status.textContent = 'Saved. Your next Facebook or Threads post will be copied.';
});

load();
