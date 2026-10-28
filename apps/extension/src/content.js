// Runs on facebook.com and threads.com. The moment the member clicks Post (or
// presses Ctrl/Cmd+Enter), it reads the words and photos from the composer and
// hands them to background.js, which sends them to their Prayer Tower account.
// It never changes the page or delays the site's own posting.
/* global PTCapture */
(function () {
  const source = PTCapture.sourceFor(location.hostname);
  if (!source) return;

  const MAX_IMAGES = 10;
  const MAX_BYTES = 9 * 1024 * 1024;
  // Photos the member chose, dropped or pasted since the last post.
  let pending = [];
  let lastSent = { text: '', at: 0 };

  const isImage = (f) => f && /^image\/(jpeg|png|webp|heic)$/.test(f.type);
  const remember = (files) => {
    for (const f of Array.from(files || [])) if (isImage(f)) pending.push(f);
    pending = pending.slice(-MAX_IMAGES);
  };

  // Capture phase: these run before the site's own handlers.
  document.addEventListener('change', (e) => e.target && e.target.type === 'file' && remember(e.target.files), true);
  document.addEventListener('drop', (e) => e.dataTransfer && remember(e.dataTransfer.files), true);
  document.addEventListener('paste', (e) => e.clipboardData && remember(e.clipboardData.files), true);

  document.addEventListener(
    'click',
    (e) => {
      const button = PTCapture.postButtonFor(e.target);
      if (button) capture(PTCapture.composerFor(button));
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (e) => capture(PTCapture.shortcutComposer(e)),
    true,
  );

  function capture(composer) {
    if (!composer) return;
    const text = PTCapture.textOf(composer);
    // The composer shows a preview of each attached photo. Prefer the original files the
    // member chose (full quality); otherwise read the previews themselves.
    const shown = PTCapture.previewImagesIn(composer);
    const files = shown.length ? pending.slice(-shown.length) : [];
    const previews = files.length ? [] : shown;
    pending = [];
    if (!text && !files.length && !previews.length) return;
    // One post, one copy, even if the button is clicked twice.
    if (text && text === lastSent.text && Date.now() - lastSent.at < 15000) return;
    lastSent = { text, at: Date.now() };
    // Read the photos now, while the site still has them, then send.
    Promise.all([...files.map(fileToBase64), ...previews.map(urlToBase64)])
      .then((images) => images.filter(Boolean).slice(0, MAX_IMAGES))
      .then((images) => chrome.runtime.sendMessage({ type: 'crosspost', post: { source, text, pageUrl: location.href, images } }))
      .catch(() => undefined);
  }

  async function urlToBase64(url) {
    try {
      const blob = await (await fetch(url)).blob();
      return isImage(blob) ? fileToBase64(blob) : null;
    } catch {
      return null;
    }
  }

  /** Base64 for the server; photos over 9 MB are shrunk to a JPEG first. */
  async function fileToBase64(file) {
    const blob = file.size > MAX_BYTES ? await shrink(file) : file;
    if (!blob || blob.size > MAX_BYTES) return null;
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { data: btoa(bin) };
  }

  async function shrink(file) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height));
      const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    } catch {
      return null;
    }
  }
})();
