// 16-bit PCM mono WAV files, the format aplay/arecord, sox and fldigi all read.
export function toWav(samples: Float32Array, sampleRate: number): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + samples.length * 2, 4);
  b.write('WAVEfmt ', 8, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32767), 44 + i * 2);
  return b;
}

/** Reads 8/16/24/32-bit PCM or 32/64-bit float WAV (what recorders and Audacity export); stereo is mixed to mono. */
export function fromWav(b: Buffer): { samples: Float32Array; sampleRate: number } {
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let at = 12;
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  while (at + 8 <= b.length) {
    const id = b.toString('ascii', at, at + 4);
    const size = b.readUInt32LE(at + 4);
    const body = at + 8;
    if (id === 'fmt ') {
      fmt = { format: b.readUInt16LE(body), channels: b.readUInt16LE(body + 2), rate: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14) };
      if (fmt.format === 0xfffe) fmt.format = b.readUInt16LE(body + 24); // WAVE_FORMAT_EXTENSIBLE
    } else if (id === 'data' && fmt) {
      if (fmt.format !== 1 && fmt.format !== 3) throw new Error(`unsupported WAV encoding ${fmt.format} (save it as PCM or float)`);
      if (!fmt.channels || !fmt.rate) throw new Error('WAV file has a broken format header');
      if (!(fmt.format === 1 ? [8, 16, 24, 32] : [32, 64]).includes(fmt.bits)) throw new Error(`unsupported WAV sample size ${fmt.bits}`);
      const width = fmt.bits / 8;
      const frames = Math.floor(Math.min(size, b.length - body) / (width * fmt.channels));
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < fmt.channels; c++) {
          const p = body + (i * fmt.channels + c) * width;
          if (fmt.format === 3) sum += fmt.bits === 32 ? b.readFloatLE(p) : b.readDoubleLE(p);
          else if (fmt.bits === 16) sum += b.readInt16LE(p) / 32768;
          else if (fmt.bits === 24) sum += b.readIntLE(p, 3) / 8388608;
          else if (fmt.bits === 32) sum += b.readInt32LE(p) / 2147483648;
          else sum += (b.readUInt8(p) - 128) / 128;
        }
        out[i] = sum / fmt.channels;
      }
      return { samples: out, sampleRate: fmt.rate };
    }
    at = body + size + (size & 1);
  }
  throw new Error('WAV file has no audio data');
}

/** Linear-interpolation resampling, for recordings not made at 48 kHz. */
export function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x;
  const out = new Float32Array(Math.floor((x.length * to) / from));
  for (let i = 0; i < out.length; i++) {
    const t = (i * from) / to;
    const a = Math.floor(t);
    const f = t - a;
    out[i] = (x[a] ?? 0) * (1 - f) + (x[a + 1] ?? 0) * f;
  }
  return out;
}
