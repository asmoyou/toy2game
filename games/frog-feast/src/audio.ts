export class GameAudio {
  enabled = true;
  private context?: AudioContext;
  private nodes = new Set<OscillatorNode>();

  unlock() {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* Optional on browsers without audio. */ }
  }

  play(kind: 'bite' | 'catch' | 'win' | 'count') {
    if (!this.enabled || this.context?.state !== 'running') return;
    const notes = { bite: [150], catch: [760, 1060], win: [523, 659, 784, 1046], count: [540] }[kind];
    notes.forEach((note, i) => {
      const ctx = this.context!, at = ctx.currentTime + i * 0.09;
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(note, at);
      oscillator.frequency.exponentialRampToValueAtTime(note * (kind === 'bite' ? 0.55 : 1.15), at + 0.12);
      gain.gain.setValueAtTime(kind === 'bite' ? 0.035 : 0.055, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.15);
      oscillator.connect(gain); gain.connect(ctx.destination); this.nodes.add(oscillator);
      oscillator.onended = () => { this.nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(at); oscillator.stop(at + 0.16);
    });
  }

  stop() { for (const node of this.nodes) { try { node.stop(); } catch { /* Already stopped. */ } } this.nodes.clear(); }
  suspend(paused: boolean) {
    if (!this.context) return;
    if (paused || !this.enabled) { this.stop(); void this.context.suspend().catch(() => {}); }
    else void this.context.resume().catch(() => {});
  }
  dispose() { this.stop(); void this.context?.close().catch(() => {}); }
}
