// The listening page (/listen, off unless Admin → Radio turns it on): anyone
// near a radio opens it on a phone or laptop, and it decodes burst frames
// (docs/RADIO_BURST.md) from the microphone, right in the browser. The sound
// never leaves the device; with receipts on (radio/receipts.ts) the page sends
// back only a fingerprint of each decoded prayer, if the listener agrees. The decoder is the station's own code, bundled by
// apps/station/scripts/build-listen.ts into decoder.generated.ts.
import type { Queryable } from '../../db.js';
import { layout, type Brand } from '../site/index.js';
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
  <p><label><input id="hf" type="checkbox"> Shortwave (SSB) radio: allow it to be tuned up to 50 Hz off (slower)</label></p>
  <p><label>Or decode a recording: <input id="file" type="file" accept="audio/*"></label></p>
</div>
<p id="tellrow" hidden><label><input id="tell" type="checkbox" checked> Let senders know their prayer was heard. Only a fingerprint of each prayer goes back, never the words.</label></p>
<div id="heard"></div>
<p><button class="button" id="report" type="button" hidden>Save channel report</button></p>
<div class="notice"><p>Tips: turn the radio up until the meter sits in the middle, keep the phone still, and keep the room quiet. The slower presets (fm-robust, fm-robust-fec, fm-standard) survive a speaker and microphone best; the fastest ones need a cable. The channel report tells the station how clear the signal is here (docs/RADIO_BURST.md, "Auto preset").</p></div>
<script>${DECODER_JS}</script>
<script>
(() => {
  const $ = (id) => document.getElementById(id);
  const RECEIPTS = !!document.getElementById('receipts-on');
  if (RECEIPTS) $('tellrow').hidden = false;
  const heard = [];
  // Copies the microphone in 4096-sample blocks on the audio thread and posts each block here.
  const WORKLET = "registerProcessor('pt-capture', class extends AudioWorkletProcessor { constructor() { super(); this.buf = new Float32Array(4096); this.n = 0; } process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) { for (let i = 0; i < ch.length; i++) { this.buf[this.n++] = ch[i]; if (this.n === this.buf.length) { this.port.postMessage(this.buf); this.buf = new Float32Array(4096); this.n = 0; } } } return true; } });";
  let packetsUpTo = 0, packets = 0;
  const ITEMS = ' prayer(s)';
  let ctx = null, stream = null, node = null, timer = null;
  let chunks = [], total = 0, dropped = 0, decodedUpTo = 0, busy = false;
  const KEEP_SECONDS = 24;
  const searchHz = () => ($('hf').checked ? 50 : 0);

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
      if (f.prayers && f.prayers.length) tell(f).then((n) => { if (n) { const t = document.createElement('p'); t.textContent = 'Its sender' + (n === 1 ? ' was' : 's were') + ' told it was heard.'; card.append(t); } });
      if (ctx) $('status').textContent = 'Listening. ' + heard.length + ' frame(s) heard so far.';
    }
  }

  // The packet fallback: short IDs and a count, never the words (docs/RADIO_BURST.md, "Packet fallback").
  function showPackets(list, rate, offset) {
    for (const p of list) {
      const end = offset + Math.round((p.end * 48000) / rate);
      if (end <= packetsUpTo) continue;
      packetsUpTo = end;
      packets++;
      const card = document.createElement('div');
      card.className = 'card';
      const h = document.createElement('h2');
      h.textContent = 'Packet from ' + p.callSign + ' at ' + new Date().toLocaleTimeString();
      const meta = document.createElement('p');
      meta.textContent = p.count + ITEMS + ' went out (part ' + p.page + ' of ' + p.pages + '). Short IDs: ' + (p.ids.join(' ') || 'none');
      card.append(h, meta);
      $('heard').prepend(card);
    }
  }

  // "On the air" receipts: each prayer's fingerprint (PTDecoder.fingerprint), never its words.
  async function tell(f) {
    if (!RECEIPTS || !$('tell').checked) return 0;
    try {
      const hashes = [...new Set(f.prayers)].slice(0, 500).map(PTDecoder.fingerprint);
      const r = await fetch('/listen/heard', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ callSign: f.callSign, preset: f.preset, snrDb: Math.round(f.snrDb * 10) / 10, hashes }) });
      return r.ok ? (await r.json()).matched : 0;
    } catch { return 0; }
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
      show(PTDecoder.decodeAudio(buf.subarray(from), rate, searchHz()), rate, dropped + from);
      const pFrom = Math.max(0, Math.round((packetsUpTo * rate) / 48000) - dropped);
      showPackets(PTDecoder.decodePackets(buf.subarray(pFrom), rate), rate, Math.round(((dropped + pFrom) * 48000) / rate));
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
    const take = (c) => { chunks.push(c); total += c.length; };
    // AudioWorklet (Web Audio's audio thread) where the browser has it; ScriptProcessor otherwise.
    if (ctx.audioWorklet) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
      try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
      node = new AudioWorkletNode(ctx, 'pt-capture', { numberOfInputs: 1, numberOfOutputs: 0 });
      node.port.onmessage = (ev) => take(ev.data);
      src.connect(node);
    } else {
      node = ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (ev) => take(new Float32Array(ev.inputBuffer.getChannelData(0)));
      src.connect(node);
      node.connect(ctx.destination);
    }
    timer = setInterval(tick, 1500);
    $('start').hidden = true; $('stop').hidden = false;
    $('status').textContent = 'Listening at ' + ctx.sampleRate + ' Hz. Waiting for a burst...';
  }

  function stop() {
    clearInterval(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (ctx) ctx.close();
    if (node && node.port) node.port.onmessage = null;
    ctx = stream = node = null; chunks = []; total = 0; dropped = 0; decodedUpTo = 0; packetsUpTo = 0;
    $('start').hidden = false; $('stop').hidden = true;
    $('status').textContent = 'Stopped. ' + heard.length + ' frame(s) heard.';
  }

  async function openFile(file) {
    $('status').textContent = 'Decoding ' + file.name + '...';
    const audio = await new AudioContext().decodeAudioData(await file.arrayBuffer());
    const frames = PTDecoder.decodeAudio(audio.getChannelData(0), audio.sampleRate, searchHz());
    decodedUpTo = 0; dropped = 0; packetsUpTo = 0;
    show(frames, audio.sampleRate, 0);
    const before = packets;
    showPackets(PTDecoder.decodePackets(audio.getChannelData(0), audio.sampleRate), audio.sampleRate, 0);
    decodedUpTo = 0; packetsUpTo = 0;
    $('status').textContent = file.name + ': ' + frames.length + ' frame(s) and ' + (packets - before) + ' packet(s) decoded.';
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

const pages = new Map<string, string>();
/** Open Circle's page: the same decoder, with no religious words in what a visitor reads. */
const neutralBody = (name: string) =>
  BODY.replace('<h1>Listen to a prayer burst</h1>', '<h1>Listen to a radio burst</h1>')
    .replace('tuned to the Prayer Tower station. When a burst plays, the prayers in it appear below.', `tuned to the ${name} station. When a burst plays, the messages in it appear below.`)
    .replace('Let senders know their prayer was heard. Only a fingerprint of each prayer goes back, never the words.', 'Let senders know their message was heard. Only a fingerprint of each message goes back, never the words.')
    .replace("const ITEMS = ' prayer(s)';", "const ITEMS = ' message(s)';");

/** The page; with receipts on it offers to tell senders their prayers were heard (radio/receipts.ts). With a brand, Open Circle's wording. */
export function listenPage(receipts = false, brand?: Brand): string {
  const key = `${receipts}:${brand?.base ?? 'pt'}:${brand?.name ?? ''}`;
  let page = pages.get(key);
  if (!page) {
    const body = (receipts ? '<i id="receipts-on" hidden></i>' : '') + (brand ? neutralBody(brand.name) : BODY);
    page = layout(brand ? 'Listen to a radio burst' : 'Listen to a prayer burst', body, '', 'en', brand);
    pages.set(key, page);
  }
  return page;
}
