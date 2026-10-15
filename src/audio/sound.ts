/**
 * Efeitos sonoros sintetizados com Web Audio (sem arquivos de áudio).
 * Só soa depois de `unlock()` num gesto do usuário, como os navegadores exigem.
 * Nada aqui conhece o resultado da rolagem além do tipo de efeito pedido.
 */

import type { FeedbackKind } from '../core/feedback.ts';

type AudioContextCtor = typeof AudioContext;

export class SoundPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** Cria/retoma o contexto de áudio. Chamar de dentro de um gesto (toque, clique, tecla). */
  unlock(): void {
    try {
      if (this.ctx === null) {
        const Ctor: AudioContextCtor | undefined =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
        if (Ctor === undefined) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
        this.noise = this.makeNoise(this.ctx);
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => undefined);
      }
    } catch {
      this.ctx = null; // sem áudio: o app segue funcionando
    }
  }

  /** Toca o efeito, se o áudio estiver liberado. Nunca lança. */
  play(kind: FeedbackKind, strength = 1): void {
    const ctx = this.ctx;
    const out = this.master;
    if (ctx === null || out === null || ctx.state !== 'running') return;
    try {
      const t = ctx.currentTime;
      switch (kind) {
        case 'throw':
          this.whoosh(ctx, out, t);
          break;
        case 'impact':
          this.clack(ctx, out, t, strength);
          break;
        case 'settle':
          this.thud(ctx, out, t);
          break;
        case 'crit':
          this.fanfare(ctx, out, t);
          break;
        case 'fumble':
          this.sadTrombone(ctx, out, t);
          break;
      }
    } catch {
      // Falha de áudio nunca interrompe a rolagem.
    }
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** Ruído filtrado com envelope curto. */
  private burst(ctx: AudioContext, out: AudioNode, t: number, opts: {
    type: BiquadFilterType; from: number; to: number; dur: number; gain: number; q?: number;
  }): void {
    if (this.noise === null) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type;
    filter.Q.value = opts.q ?? 1;
    filter.frequency.setValueAtTime(opts.from, t);
    filter.frequency.exponentialRampToValueAtTime(opts.to, t + opts.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(filter).connect(g).connect(out);
    src.start(t);
    src.stop(t + opts.dur + 0.02);
  }

  /** Tom com envelope de ataque rápido e decaimento exponencial. */
  private tone(ctx: AudioContext, out: AudioNode, t: number, opts: {
    type: OscillatorType; freq: number; endFreq?: number; dur: number; gain: number; delay?: number;
  }): void {
    const start = t + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.freq, start);
    if (opts.endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(opts.endFreq, start + opts.dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(opts.gain, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + opts.dur);
    osc.connect(g).connect(out);
    osc.start(start);
    osc.stop(start + opts.dur + 0.02);
  }

  /** Som do arremesso: atrito de marfim e mesa de madeira. */
  private whoosh(ctx: AudioContext, out: AudioNode, t: number): void {
    this.burst(ctx, out, t, { type: 'bandpass', from: 350, to: 1600, dur: 0.24, gain: 0.28, q: 1.2 });
    this.tone(ctx, out, t, { type: 'sine', freq: 140, endFreq: 80, dur: 0.18, gain: 0.15 });
  }

  /** Impacto de marfim denso contra borda e mesa de madeira: estalo nítido e ressonância oca de madeira. */
  private clack(ctx: AudioContext, out: AudioNode, t: number, strength: number): void {
    const s = Math.min(Math.max(strength, 0.15), 1);
    const clickFreq = 2600 + Math.random() * 600;
    const woodResonance = 190 + Math.random() * 40;

    // Estalo seco característico do marfim polido
    this.burst(ctx, out, t, { type: 'bandpass', from: clickFreq, to: clickFreq * 0.6, dur: 0.035, gain: 0.45 * s, q: 3.5 });

    // Ressonância do corpo de madeira da mesa / anteparo
    this.tone(ctx, out, t, { type: 'triangle', freq: woodResonance, endFreq: woodResonance * 0.65, dur: 0.11, gain: 0.38 * s });
    this.burst(ctx, out, t, { type: 'lowpass', from: 800, to: 150, dur: 0.06, gain: 0.25 * s });
  }

  /** Parada final na mesa de feltro de lã sobre madeira: baque macio e abafado. */
  private thud(ctx: AudioContext, out: AudioNode, t: number): void {
    this.tone(ctx, out, t, { type: 'sine', freq: 130, endFreq: 65, dur: 0.15, gain: 0.35 });
    this.burst(ctx, out, t, { type: 'lowpass', from: 450, to: 120, dur: 0.07, gain: 0.2 });
  }

  /** Vitória (20): arpejo ascendente curto e brilhante. */
  private fanfare(ctx: AudioContext, out: AudioNode, t: number): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      this.tone(ctx, out, t, { type: 'triangle', freq, dur: i === 3 ? 0.45 : 0.16, gain: 0.3, delay: i * 0.09 });
      this.tone(ctx, out, t, { type: 'sine', freq: freq * 2, dur: i === 3 ? 0.4 : 0.12, gain: 0.08, delay: i * 0.09 });
    });
  }

  /** Derrota (1): duas notas descendentes e graves. */
  private sadTrombone(ctx: AudioContext, out: AudioNode, t: number): void {
    this.tone(ctx, out, t, { type: 'sawtooth', freq: 233, endFreq: 220, dur: 0.22, gain: 0.16 });
    this.tone(ctx, out, t, { type: 'sawtooth', freq: 196, endFreq: 130, dur: 0.45, gain: 0.16, delay: 0.24 });
  }
}
