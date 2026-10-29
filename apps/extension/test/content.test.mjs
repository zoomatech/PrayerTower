// @vitest-environment-options {"url": "https://www.facebook.com/"}
// content.js on a Facebook page: what it sends when the member clicks Post.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const sent = [];
const flush = () => new Promise((r) => setTimeout(r, 20));

beforeAll(() => {
  // Browsers have Blob.arrayBuffer(); jsdom does not.
  Blob.prototype.arrayBuffer ??= function () {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsArrayBuffer(this);
    });
  };
  globalThis.PTCapture = createRequire(import.meta.url)('../src/capture.js');
  globalThis.chrome = { runtime: { sendMessage: vi.fn(async (msg) => sent.push(msg)) } };
  // Loaded once, as the browser does for each page.
  new Function(readFileSync(join(import.meta.dirname, '..', 'src', 'content.js'), 'utf8'))();
});

beforeEach(() => {
  sent.length = 0;
  document.body.innerHTML = `
    <div role="dialog" aria-label="Create post">
      <div contenteditable="true" role="textbox"><p>Lunch with Grandma today</p></div>
      <input type="file" accept="image/*,video/*" multiple>
      <div class="previews"></div>
      <div role="button" tabindex="0" aria-label="Post"><span>Post</span></div>
    </div>
    <div role="article">
      <div contenteditable="true" role="textbox" class="comment">nice!</div>
      <div role="button" aria-label="Comment"><span>Comment</span></div>
    </div>`;
});

const post = () => document.querySelector('[aria-label="Post"] span').click();

/** The member picks files with the site's own file input. */
function choose(files) {
  const input = document.querySelector('input[type=file]');
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  // The site then shows a preview of each one.
  document.querySelector('.previews').innerHTML = files.map((_, i) => `<img src="blob:https://www.facebook.com/${i}">`).join('');
}

describe('content script', () => {
  it('sends the words when Post is clicked, once even if clicked twice', async () => {
    post();
    post();
    await flush();
    expect(sent).toEqual([{ type: 'crosspost', post: { source: 'facebook', text: 'Lunch with Grandma today', pageUrl: 'https://www.facebook.com/', media: [] } }]);
  });

  it('sends the photo and video the member chose, as the original files', async () => {
    document.querySelector('[role=textbox] p').textContent = 'Photos from the trip';
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], 'a.jpg', { type: 'image/jpeg' });
    const video = new File([new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70])], 'b.mp4', { type: 'video/mp4' });
    const other = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    choose([photo, other, video]);
    post();
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].post.media).toEqual([{ data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64') }, { data: Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]).toString('base64') }]);
  });

  it('leaves comments alone: their buttons and Ctrl+Enter outside the composer', async () => {
    document.querySelector('[aria-label="Comment"] span').click();
    document.querySelector('.comment').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    await flush();
    expect(sent).toEqual([]);
  });

  it('sends on Ctrl+Enter in the composer, and nothing for an empty post', async () => {
    const box = document.querySelector('[role=dialog] [role=textbox]');
    box.querySelector('p').textContent = 'Posted with the keyboard';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
    await flush();
    expect(sent.map((m) => m.post.text)).toEqual(['Posted with the keyboard']);
    box.querySelector('p').textContent = '';
    post();
    await flush();
    expect(sent).toHaveLength(1);
  });
});
