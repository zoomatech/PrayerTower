// The listening page (/listen, off unless Admin → Radio turns it on): anyone
// near a radio opens it on a phone or laptop, and it decodes burst frames
// (docs/RADIO_BURST.md) from the microphone, right in the browser. Nothing
// leaves the device. The decoder is the station's own code, bundled by
// apps/station/scripts/build-listen.ts into decoder.generated.ts.
import type { Queryable } from '../../db.js';
import { layout } from '../site/index.js';
import { DECODER_JS } from './decoder.generated.js';

export async function enabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select listen_page_enabled as on from public.token_settings');
  return rows[0]?.on === true;
}

const BODY = `
<style>[hidden] { display: none !important; } button.button { border: 0; font: inherit; cursor: pointer; }</style>
<h1>Listen to a prayer burst</h1>
<p class="lede">Hold this phone or laptop near a radio tuned to the Prayer Tower station. When a burst plays, the prayers in it appear below.</p>
<div class="card">
  <p><button class="button" id="start" type="button">Start listening</button> <button class="button" id="stop" type="button" hidden>Stop</button></p>
  <p id="status" role="status" aria-live="polite">Not listening. Your browser will ask to use the microphone. The sound stays on this device.</p>
  <p><label for="meter">Sound level</label> <meter id="meter" min="0" max="1" low="0.05" high="0.7" optimum="0.3" value="0"></meter></p>
  <p><label>Or decode a recording: <input id="file" type="file" accept="audio/*"></label></p>
</div>
<div id="heard"></div>
<p><button class="button" id="report" type="button" hidden>Save channel report</button></p>
<div class="notice"><p>Tips: turn the radio up until the meter sits in the middle, keep the phone still, and keep the room quiet. The slower presets (fm-robust, fm-robust-fec, fm-standard) survive a speaker and microphone best; the fastest ones need a cable. The channel report tells the station how clear the signal is here (docs/RADIO_BURST.md, "Auto preset").</p></div>
<script>${DECODER_JS}</script>
<script>
(() => {
  const $ = (id) => document.getElementById(id);
  const heard = [];
  let ctx = null, stream = null, node = null, timer = null;
  let chunks = [], total = 0, dropped = 0, decodedUpTo = 0, busy = false;
  const KEEP_SECONDS = 24;

  function show(frames, rate, offset) {
    for (const f of frames) {
      const end = offset + Math.round((f.end * rate) / PTDecoder.SAMPLE_RATE);
      if (end <= decodedUpTo) continue;
      decodedUpTo = end;
      heard.push(f);
      const card = document.createElement('div');
      card.className = 'card';
      const h = document.createElement('h2');
      h.textContent = 'From ' + f.callSign + ' at ' + new Date().toLocaleTimeString();
      const meta = document.createElement('p');
      meta.textContent = f.preset + ', signal ' + f.snrDb.toFixed(1) + ' dB' + (f.corrected ? ', errors corrected' : '');
      card.append(h, meta);
      if (f.prayers) {
        const list = document.createElement('ul');
        for (const p of f.prayers) { const li = document.createElement('li'); li.textContent = p; list.append(li); }
        card.append(list);
      } else {
        const p = document.createElement('p');
        p.textContent = 'This frame was packed with codec ' + f.codec + ', which this page can\\'t open. The station CLI decodes it from a recording.';
        card.append(p);
      }
      $('heard').prepend(card);
      $('report').hidden = false;
      if (ctx) $('status').textContent = 'Listening. ' + heard.length + ' frame(s) heard so far.';
    }
  }

  function tick() {
    if (busy || !total) return;
    busy = true;
    try {
      const rate = ctx.sampleRate;
      const buf = new Float32Array(total);
      let at = 0;
      for (const c of chunks) { buf.set(c, at); at += c.length; }
      let level = 0;
      const tail = buf.subarray(Math.max(0, buf.length - rate / 4));
      for (const v of tail) level += v * v;
      $('meter').value = Math.min(1, Math.sqrt(level / Math.max(1, tail.length)) * 4);
      const from = Math.max(0, decodedUpTo - dropped);
      show(PTDecoder.decodeAudio(buf.subarray(from), rate), rate, dropped + from);
      while (total - chunks[0].length > KEEP_SECONDS * rate) { total -= chunks[0].length; dropped += chunks[0].length; chunks.shift(); }
    } finally { busy = false; }
  }

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
    } catch (e) {
      $('status').textContent = 'The microphone is not available: ' + e.message;
      return;
    }
    ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (ev) => { const c = new Float32Array(ev.inputBuffer.getChannelData(0)); chunks.push(c); total += c.length; };
    src.connect(node);
    node.connect(ctx.destination);
    timer = setInterval(tick, 1500);
    $('start').hidden = true; $('stop').hidden = false;
    $('status').textContent = 'Listening at ' + ctx.sampleRate + ' Hz. Waiting for a burst...';
  }

  function stop() {
    clearInterval(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (ctx) ctx.close();
    ctx = stream = node = null; chunks = []; total = 0; dropped = 0; decodedUpTo = 0;
    $('start').hidden = false; $('stop').hidden = true;
    $('status').textContent = 'Stopped. ' + heard.length + ' frame(s) heard.';
  }

  async function openFile(file) {
    $('status').textContent = 'Decoding ' + file.name + '...';
    const audio = await new AudioContext().decodeAudioData(await file.arrayBuffer());
    const frames = PTDecoder.decodeAudio(audio.getChannelData(0), audio.sampleRate);
    decodedUpTo = 0; dropped = 0;
    show(frames, audio.sampleRate, 0);
    decodedUpTo = 0;
    $('status').textContent = file.name + ': ' + frames.length + ' frame(s) decoded.';
  }

  function saveReport() {
    const r = PTDecoder.channelReport(heard.slice(-5));
    if (!r) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2) + '\\n'], { type: 'application/json' }));
    a.download = 'channel.json';
    a.click();
  }

  $('start').onclick = start;
  $('stop').onclick = stop;
  $('report').onclick = saveReport;
  $('file').onchange = (e) => { const f = e.target.files[0]; if (f) openFile(f).catch((err) => { $('status').textContent = 'Could not decode that file: ' + err.message; }); };
})();
</script>`;

let page: string | null = null;
export function listenPage(): string {
  return (page ??= layout('Listen to a prayer burst', BODY, ''));
}
