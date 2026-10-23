/**
 * Synthesized UI sounds (Web Audio) — no external files.
 * Profiles: ios (soft), tactile (thock), minimal (micro-ticks).
 */

export type SoundProfile = 'ios' | 'tactile' | 'minimal';

export type SoundKind =
  | 'key'
  | 'keySpace'
  | 'keyBackspace'
  | 'keyEnter'
  | 'tabOpen'
  | 'tabClose'
  | 'tabSwitch'
  | 'toggle'
  | 'click'
  | 'popover'
  | 'downloadDone'
  | 'sample';

export type SoundConfig = {
  enabled: boolean;
  profile: SoundProfile;
  /** 0–100 */
  volume: number;
  typing: boolean;
  tabs: boolean;
  ui: boolean;
  downloads: boolean;
};

const DEFAULT_CFG: SoundConfig = {
  enabled: false,
  profile: 'ios',
  volume: 55,
  typing: true,
  tabs: true,
  ui: true,
  downloads: true,
};

let cfg: SoundConfig = { ...DEFAULT_CFG };
let ctx: AudioContext | null = null;
let lastKeyAt = 0;
let masterGain: GainNode | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function vol(): number {
  return Math.max(0, Math.min(1, cfg.volume / 100)) * 0.42;
}

function noiseBuf(ac: AudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ac.sampleRate * seconds));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function envGain(
  ac: AudioContext,
  t0: number,
  attack: number,
  decay: number,
  peak: number,
): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  return g;
}

function tone(
  ac: AudioContext,
  dest: AudioNode,
  freq: number,
  t0: number,
  dur: number,
  peak: number,
  type: OscillatorType = 'sine',
) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  const g = envGain(ac, t0, Math.min(0.012, dur * 0.25), dur, peak);
  o.connect(g);
  g.connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function thock(ac: AudioContext, dest: AudioNode, t0: number, peak: number) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuf(ac, 0.04);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 420;
  bp.Q.value = 1.4;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const g = envGain(ac, t0, 0.0015, 0.045, peak);
  src.connect(bp);
  bp.connect(lp);
  lp.connect(g);
  g.connect(dest);
  src.start(t0);
  src.stop(t0 + 0.05);
}

function airClick(ac: AudioContext, dest: AudioNode, t0: number, peak: number, bright: number) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuf(ac, 0.03);
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1800 + bright * 800;
  const g = envGain(ac, t0, 0.001, 0.028, peak);
  src.connect(hp);
  hp.connect(g);
  g.connect(dest);
  src.start(t0);
  src.stop(t0 + 0.035);
}

function categoryAllows(kind: SoundKind): boolean {
  if (kind === 'sample') return true;
  if (kind.startsWith('key')) return cfg.typing;
  if (kind.startsWith('tab')) return cfg.tabs;
  if (kind === 'downloadDone') return cfg.downloads;
  return cfg.ui;
}

function playProfile(kind: SoundKind) {
  const ac = ensureCtx();
  if (!ac || !masterGain) return;
  const t0 = ac.currentTime;
  const v = vol();
  const p = cfg.profile;
  const bus = ac.createGain();
  bus.gain.value = 1;
  bus.connect(masterGain);
  masterGain.gain.setValueAtTime(1, t0);

  const jitter = (n: number) => n * (0.94 + Math.random() * 0.12);

  if (p === 'ios') {
    if (kind === 'key' || kind === 'sample') {
      airClick(ac, bus, t0, v * 0.22, 0.4);
      tone(ac, bus, jitter(880), t0, 0.05, v * 0.18, 'sine');
    } else if (kind === 'keySpace') {
      tone(ac, bus, jitter(420), t0, 0.06, v * 0.2, 'sine');
      airClick(ac, bus, t0, v * 0.12, 0);
    } else if (kind === 'keyBackspace') {
      tone(ac, bus, jitter(320), t0, 0.055, v * 0.22, 'triangle');
    } else if (kind === 'keyEnter') {
      tone(ac, bus, 620, t0, 0.04, v * 0.2, 'sine');
      tone(ac, bus, 930, t0 + 0.03, 0.06, v * 0.16, 'sine');
    } else if (kind === 'tabOpen') {
      tone(ac, bus, 520, t0, 0.07, v * 0.2, 'sine');
      tone(ac, bus, 780, t0 + 0.05, 0.09, v * 0.18, 'sine');
    } else if (kind === 'tabClose') {
      tone(ac, bus, 640, t0, 0.06, v * 0.18, 'sine');
      tone(ac, bus, 380, t0 + 0.04, 0.08, v * 0.16, 'sine');
    } else if (kind === 'tabSwitch') {
      airClick(ac, bus, t0, v * 0.16, 0.2);
      tone(ac, bus, 760, t0, 0.035, v * 0.12, 'sine');
    } else if (kind === 'toggle') {
      tone(ac, bus, 540, t0, 0.04, v * 0.18, 'sine');
      tone(ac, bus, 860, t0 + 0.035, 0.07, v * 0.2, 'sine');
    } else if (kind === 'click' || kind === 'popover') {
      airClick(ac, bus, t0, v * 0.18, 0.5);
      tone(ac, bus, 990, t0, 0.03, v * 0.1, 'sine');
    } else if (kind === 'downloadDone') {
      tone(ac, bus, 523.25, t0, 0.08, v * 0.18, 'sine');
      tone(ac, bus, 659.25, t0 + 0.07, 0.09, v * 0.16, 'sine');
      tone(ac, bus, 783.99, t0 + 0.14, 0.12, v * 0.14, 'sine');
    }
    return;
  }

  if (p === 'tactile') {
    if (kind === 'key' || kind === 'sample') {
      thock(ac, bus, t0, v * 0.55);
      tone(ac, bus, jitter(180), t0, 0.03, v * 0.12, 'triangle');
    } else if (kind === 'keySpace') {
      thock(ac, bus, t0, v * 0.65);
      tone(ac, bus, 110, t0, 0.05, v * 0.2, 'sine');
    } else if (kind === 'keyBackspace') {
      thock(ac, bus, t0, v * 0.5);
      tone(ac, bus, 140, t0, 0.04, v * 0.18, 'triangle');
    } else if (kind === 'keyEnter') {
      thock(ac, bus, t0, v * 0.7);
      tone(ac, bus, 220, t0 + 0.02, 0.06, v * 0.15, 'sine');
    } else if (kind === 'tabOpen') {
      thock(ac, bus, t0, v * 0.4);
      tone(ac, bus, 360, t0, 0.05, v * 0.16, 'triangle');
      tone(ac, bus, 540, t0 + 0.04, 0.07, v * 0.14, 'triangle');
    } else if (kind === 'tabClose') {
      thock(ac, bus, t0, v * 0.35);
      tone(ac, bus, 300, t0, 0.08, v * 0.16, 'triangle');
    } else if (kind === 'tabSwitch') {
      thock(ac, bus, t0, v * 0.28);
    } else if (kind === 'toggle') {
      thock(ac, bus, t0, v * 0.45);
      tone(ac, bus, 480, t0 + 0.02, 0.05, v * 0.12, 'square');
    } else if (kind === 'click' || kind === 'popover') {
      thock(ac, bus, t0, v * 0.32);
    } else if (kind === 'downloadDone') {
      tone(ac, bus, 392, t0, 0.07, v * 0.2, 'triangle');
      tone(ac, bus, 494, t0 + 0.08, 0.08, v * 0.18, 'triangle');
      tone(ac, bus, 587, t0 + 0.16, 0.1, v * 0.16, 'triangle');
    }
    return;
  }

  // minimal
  const micro = v * 0.12;
  if (kind === 'key' || kind === 'sample') {
    airClick(ac, bus, t0, micro, 0.8);
  } else if (kind === 'keySpace' || kind === 'keyBackspace') {
    tone(ac, bus, kind === 'keySpace' ? 280 : 240, t0, 0.025, micro * 1.2, 'sine');
  } else if (kind === 'keyEnter') {
    tone(ac, bus, 400, t0, 0.03, micro * 1.3, 'sine');
  } else if (kind === 'tabOpen') {
    tone(ac, bus, 600, t0, 0.04, micro * 1.4, 'sine');
  } else if (kind === 'tabClose') {
    tone(ac, bus, 340, t0, 0.04, micro * 1.3, 'sine');
  } else if (kind === 'tabSwitch' || kind === 'click' || kind === 'popover') {
    airClick(ac, bus, t0, micro * 0.9, 0.6);
  } else if (kind === 'toggle') {
    tone(ac, bus, 720, t0, 0.03, micro * 1.2, 'sine');
  } else if (kind === 'downloadDone') {
    tone(ac, bus, 660, t0, 0.05, micro * 1.5, 'sine');
    tone(ac, bus, 880, t0 + 0.06, 0.06, micro * 1.2, 'sine');
  }
}

export function configureSounds(next: Partial<SoundConfig>) {
  cfg = { ...cfg, ...next };
}

export function getSoundConfig(): SoundConfig {
  return { ...cfg };
}

export function playSound(kind: SoundKind) {
  if (!cfg.enabled && kind !== 'sample') return;
  if (!categoryAllows(kind)) return;
  if (cfg.volume <= 0) return;
  try {
    playProfile(kind);
  } catch {
    /* ignore audio errors */
  }
}

export function playTypingKey(key: string, code?: string) {
  if (!cfg.enabled || !cfg.typing || cfg.volume <= 0) return;
  const now = performance.now();
  if (now - lastKeyAt < 18) return;
  lastKeyAt = now;

  const k = key.length === 1 ? key : key;
  if (k === ' ' || code === 'Space') {
    playSound('keySpace');
    return;
  }
  if (k === 'Backspace' || code === 'Backspace') {
    playSound('keyBackspace');
    return;
  }
  if (k === 'Enter' || code === 'Enter' || code === 'NumpadEnter') {
    playSound('keyEnter');
    return;
  }
  // printable / compose keys only
  if (k.length === 1 || code?.startsWith('Key') || code?.startsWith('Digit')) {
    playSound('key');
  }
}

export function playSample() {
  const ac = ensureCtx();
  if (!ac) return;
  // brief sequence so the profile is audible even when master toggle is off
  const was = cfg.enabled;
  cfg = { ...cfg, enabled: true };
  playSound('sample');
  window.setTimeout(() => playSound('toggle'), 90);
  window.setTimeout(() => playSound('tabOpen'), 200);
  window.setTimeout(() => {
    cfg = { ...cfg, enabled: was };
  }, 400);
}
