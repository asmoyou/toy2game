export class GameAudio {
  enabled = true;
  private context?: AudioContext;

  unlock() {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* Audio is optional on unsupported browsers. */ }
  }

  private tone(frequency: number, delay: number, duration = 0.16) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    const time = this.context.currentTime + delay;
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0.07, time); gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(gain); gain.connect(this.context.destination);
    oscillator.start(time); oscillator.stop(time + duration);
  }

  play(kind: 'place' | 'roll' | 'turn' | 'win' | 'fall') {
    const notes = { place: [660, 990], roll: [330, 440, 550, 660], turn: [780], win: [523, 659, 784, 1046], fall: [520, 390, 260, 195] }[kind];
    notes.forEach((frequency, index) => this.tone(frequency, index * 0.09, kind === 'fall' ? 0.3 : 0.17));
  }

  suspend(paused: boolean) {
    if (!this.context) return;
    if (paused || !this.enabled) void this.context.suspend().catch(() => {});
    else void this.context.resume().catch(() => {});
  }

  dispose() { void this.context?.close().catch(() => {}); }
}
