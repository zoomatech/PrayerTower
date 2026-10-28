// The extension finds the post being published from the page itself. These
// pages copy the structure Facebook and Threads use (roles and labels, not
// class names) as of October 2026.
import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';

const capture = createRequire(import.meta.url)('../src/capture.js');

const facebookComposer = `
  <div role="dialog" aria-label="Create post">
    <form>
      <div contenteditable="true" role="textbox" aria-label="What's on your mind, Steve?"><p>Beautiful morning at the lake</p><p>with the kids!</p></div>
      <div><img src="blob:https://www.facebook.com/1234" alt=""><img src="https://static.xx.fbcdn.net/emoji.png" alt=""><video src="blob:https://www.facebook.com/5678"></video></div>
      <div role="button" tabindex="0" aria-label="Post"><span><span>Post</span></span></div>
    </form>
  </div>
  <div role="article"><div contenteditable="true" role="textbox" aria-label="Write a comment">draft comment</div>
    <div role="button" aria-label="Share"><span>Share</span></div></div>`;

const threadsComposer = `
  <div role="dialog">
    <div contenteditable="true" role="textbox"><p>First part</p></div>
    <div contenteditable="true" role="textbox"><p>Second part</p></div>
    <div role="button"><div>Post</div></div>
  </div>`;

describe('capture', () => {
  beforeEach(() => (document.body.innerHTML = ''));

  it('knows which site it is on', () => {
    expect(capture.sourceFor('www.facebook.com')).toBe('facebook');
    expect(capture.sourceFor('m.facebook.com')).toBe('facebook');
    expect(capture.sourceFor('www.threads.com')).toBe('threads');
    expect(capture.sourceFor('www.threads.net')).toBe('threads');
    expect(capture.sourceFor('evilfacebook.com')).toBeNull();
  });

  it('reads the words and photo and video previews from the Facebook composer when Post is clicked', () => {
    document.body.innerHTML = facebookComposer;
    const inner = document.querySelector('[aria-label="Post"] span span');
    const button = capture.postButtonFor(inner);
    expect(button.getAttribute('aria-label')).toBe('Post');
    const composer = capture.composerFor(button);
    expect(capture.textOf(composer)).toContain('Beautiful morning at the lake');
    expect(capture.textOf(composer)).toContain('with the kids!');
    expect(capture.textOf(composer)).not.toContain('draft comment');
    expect(capture.previewMediaIn(composer)).toEqual(['blob:https://www.facebook.com/1234', 'blob:https://www.facebook.com/5678']);
  });

  it('ignores other buttons, disabled Post buttons and comment boxes', () => {
    document.body.innerHTML = facebookComposer;
    expect(capture.postButtonFor(document.querySelector('[aria-label="Share"] span'))).toBeNull();
    const post = document.querySelector('[aria-label="Post"]');
    post.setAttribute('aria-disabled', 'true');
    expect(capture.postButtonFor(post)).toBeNull();
    const comment = document.querySelector('[aria-label="Write a comment"]');
    expect(capture.shortcutComposer({ key: 'Enter', ctrlKey: true, target: comment })).toBeNull();
  });

  it('joins the posts of a Threads thread and handles Cmd+Enter', () => {
    document.body.innerHTML = threadsComposer;
    const button = capture.postButtonFor(document.querySelector('[role="button"] div'));
    expect(capture.textOf(capture.composerFor(button))).toBe('First part\n\nSecond part');
    const box = document.querySelector('[role="textbox"]');
    expect(capture.shortcutComposer({ key: 'Enter', metaKey: true, target: box })).toBe(document.querySelector('[role="dialog"]'));
    expect(capture.shortcutComposer({ key: 'Enter', target: box })).toBeNull();
  });
});
