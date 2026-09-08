export class GameAudio {
  enabled = true;
  private context?: AudioContext;
  private nodes = new Set<OscillatorNode>();
  unlock() {
    if (!this.enabled) return;
    try { this.context ??= new AudioContext(); if (this.context.state === 'suspended') void this.context.resume().catch(() => {}); } catch { /* Audio is optional. */ }
  }
  play(kind: 'flip' | 'match' | 'miss' | 'win') {
    if (!this.enabled || this.context?.state !== 'running') return;
    const notes = { flip: [620], match: [659, 880], miss: [330, 294], win: [523, 659, 784, 1046] }[kind];
    notes.forEach((note, i) => {
      const ctx = this.context!, at = ctx.currentTime + i * 0.1;
      const oscillator = ctx.createOscillator(), gain = ctx.createGain(); oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(note, at); gain.gain.setValueAtTime(0.045, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.18); oscillator.connect(gain); gain.connect(ctx.destination);
      this.nodes.add(oscillator); oscillator.onended = () => { this.nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(at); oscillator.stop(at + 0.2);
    });
  }
  suspend(paused: boolean) {
    if (!this.context) return;
    if (paused || !this.enabled) { this.stop(); void this.context.suspend().catch(() => {}); }
    else void this.context.resume().catch(() => {});
  }
  stop() { for (const node of this.nodes) { try { node.stop(); } catch { /* Already stopped. */ } } this.nodes.clear(); }
  dispose() { this.stop(); void this.context?.close().catch(() => {}); }
}
