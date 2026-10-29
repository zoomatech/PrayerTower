// Finding the post the member is about to publish on Facebook or Threads.
// Plain functions over the page's DOM, shared by content.js and the tests.
// Both sites use a contenteditable text box (role="textbox") and a Post
// button (role="button") inside the same composer; their class names change
// often, so nothing here depends on them.
(function (root) {
  /** Button words that publish a new post (English, the app's only language). */
  const POST_WORDS = /^(post|post now|share now)$/i;

  /** facebook or threads, from the page's host name; null elsewhere. */
  function sourceFor(hostname) {
    if (/(^|\.)facebook\.com$/.test(hostname)) return 'facebook';
    if (/(^|\.)threads\.(com|net)$/.test(hostname)) return 'threads';
    return null;
  }

  function labelOf(el) {
    return (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /** The Post button a click landed on (the click target is often a span inside it), or null. */
  function postButtonFor(target) {
    let el = target && target.nodeType === 1 ? target : target && target.parentElement;
    for (let depth = 0; el && depth < 6; depth++, el = el.parentElement) {
      if (el.matches('button, [role="button"], input[type="submit"]')) {
        if (el.getAttribute('aria-disabled') === 'true' || el.disabled) return null;
        return POST_WORDS.test(labelOf(el)) ? el : null;
      }
    }
    return null;
  }

  function textBoxesIn(el) {
    const boxes = Array.from(el.querySelectorAll('[contenteditable="true"], textarea')).filter((box) => !box.closest('[aria-hidden="true"]'));
    // Only the outermost editable element of each box.
    return boxes.filter((box) => !boxes.some((other) => other !== box && other.contains(box)));
  }

  /** The composer around a Post button: the nearest ancestor that holds a text box. */
  function composerFor(button) {
    for (let el = button.parentElement; el; el = el.parentElement) {
      if (textBoxesIn(el).length) return el;
    }
    return null;
  }

  /** The words in the composer. Threads keeps one box per post in a thread; they are joined. */
  function textOf(composer) {
    return textBoxesIn(composer)
      .map((box) => (box.tagName === 'TEXTAREA' ? box.value : box.innerText || box.textContent || ''))
      .map((t) => t.replace(/\u200b/g, '').trim())
      .filter(Boolean)
      .join('\n\n');
  }

  /** Photo and video previews in the composer (blob: or data: links the site made from the chosen files). */
  function previewMediaIn(composer) {
    const seen = new Set();
    return Array.from(composer.querySelectorAll('img, video, video source'))
      .map((el) => el.getAttribute('src') || '')
      .filter((src) => (src.startsWith('blob:') || /^data:(image|video)\//.test(src)) && !seen.has(src) && seen.add(src));
  }

  /**
   * Ctrl+Enter or Cmd+Enter in the post composer (a dialog on both sites) also posts.
   * Returns the composer, or null; comment boxes in the feed are left alone.
   */
  function shortcutComposer(event) {
    if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || !event.target || !event.target.closest) return null;
    if (!event.target.closest('[contenteditable="true"], textarea')) return null;
    return event.target.closest('[role="dialog"]');
  }

  const api = { sourceFor, postButtonFor, composerFor, textOf, previewMediaIn, shortcutComposer, POST_WORDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PTCapture = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
