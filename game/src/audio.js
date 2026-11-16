// All sound is synthesised with WebAudio: no audio files, no network. A tiny
// helper builds noise bursts and tones; each named sound is one short recipe.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      const length = Math.floor(ctx.sampleRate * 0.5);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      return false;
    }
    return true;
  }

  function noise({ duration, filterFreq, type = 'lowpass', gain = 0.5, when = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(amp).connect(master);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  function tone({ freq, endFreq = null, duration, type = 'sine', gain = 0.3, when = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // distance 0..1 scales loudness: far shots are quieter.
  function scaled(distance, base) {
    return base * Math.max(0.08, 1 - Math.min(1, distance / 60) * 0.85);
  }

  return {
    unlock() { ensure(); },
    shot(kind, distance = 0) {
      if (!ensure()) return;
      if (kind === 'longshot') {
        noise({ duration: 0.22, filterFreq: 900, gain: scaled(distance, 0.9) });
        tone({ freq: 160, endFreq: 55, duration: 0.18, type: 'sawtooth', gain: scaled(distance, 0.25) });
      } else if (kind === 'vex9') {
        noise({ duration: 0.09, filterFreq: 1600, gain: scaled(distance, 0.55) });
      } else if (kind === 'p9') {
        noise({ duration: 0.1, filterFreq: 1300, gain: scaled(distance, 0.6) });
      } else {
        noise({ duration: 0.13, filterFreq: 1200, gain: scaled(distance, 0.7) });
        tone({ freq: 130, endFreq: 60, duration: 0.1, type: 'sawtooth', gain: scaled(distance, 0.18) });
      }
    },
    dryFire() {
      if (!ensure()) return;
      tone({ freq: 1800, duration: 0.03, type: 'square', gain: 0.12 });
    },
    reload() {
      if (!ensure()) return;
      tone({ freq: 900, duration: 0.04, type: 'square', gain: 0.12 });
      tone({ freq: 600, duration: 0.04, type: 'square', gain: 0.12, when: 0.18 });
      tone({ freq: 1100, duration: 0.05, type: 'square', gain: 0.14, when: 0.45 });
    },
    hit(kill) {
      if (!ensure()) return;
      tone({ freq: kill ? 1560 : 1180, duration: 0.06, type: 'sine', gain: 0.22 });
      if (kill) tone({ freq: 2090, duration: 0.09, type: 'sine', gain: 0.18, when: 0.07 });
    },
    hurt() {
      if (!ensure()) return;
      tone({ freq: 220, endFreq: 110, duration: 0.16, type: 'sawtooth', gain: 0.2 });
    },
    explosion(distance = 0) {
      if (!ensure()) return;
      noise({ duration: 0.9, filterFreq: 420, gain: scaled(distance, 1.0) });
      tone({ freq: 90, endFreq: 28, duration: 0.8, type: 'sine', gain: scaled(distance, 0.8) });
    },
    beep(final = false) {
      if (!ensure()) return;
      tone({ freq: final ? 1900 : 1350, duration: 0.09, type: 'sine', gain: 0.2 });
    },
    plant() {
      if (!ensure()) return;
      tone({ freq: 700, duration: 0.12, type: 'square', gain: 0.16 });
      tone({ freq: 700, duration: 0.12, type: 'square', gain: 0.16, when: 0.2 });
    },
    defuse() {
      if (!ensure()) return;
      tone({ freq: 520, duration: 0.1, type: 'sine', gain: 0.16 });
      tone({ freq: 780, duration: 0.14, type: 'sine', gain: 0.16, when: 0.15 });
    },
    step() {
      if (!ensure()) return;
      noise({ duration: 0.05, filterFreq: 500, gain: 0.05 });
    },
    buy() {
      if (!ensure()) return;
      tone({ freq: 990, duration: 0.07, type: 'sine', gain: 0.18 });
      tone({ freq: 1320, duration: 0.1, type: 'sine', gain: 0.16, when: 0.08 });
    },
    roundWin() {
      if (!ensure()) return;
      tone({ freq: 523, duration: 0.14, type: 'sine', gain: 0.2 });
      tone({ freq: 659, duration: 0.14, type: 'sine', gain: 0.2, when: 0.14 });
      tone({ freq: 784, duration: 0.24, type: 'sine', gain: 0.22, when: 0.28 });
    },
    roundLose() {
      if (!ensure()) return;
      tone({ freq: 392, duration: 0.16, type: 'sine', gain: 0.18 });
      tone({ freq: 311, duration: 0.26, type: 'sine', gain: 0.18, when: 0.16 });
    },
  };
}
