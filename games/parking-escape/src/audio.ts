export class ParkingAudio {
  enabled = true;
  private context?: AudioContext;

  unlock() {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* Audio is optional. */ }
  }

  play(win = false) {
    if (!this.enabled || this.context?.state !== 'running') return;
    (win ? [523, 659, 784, 1047] : [440, 660]).forEach((frequency, index) => {
      const context = this.context!, oscillator = context.createOscillator(), gain = context.createGain();
      const at = context.currentTime + index * 0.09;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.035, at); gain.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(at); oscillator.stop(at + 0.16);
    });
  }

  suspend(paused: boolean) {
    if (!this.context) return;
    if (paused || !this.enabled) void this.context.suspend().catch(() => {});
    else void this.context.resume().catch(() => {});
  }

  dispose() { void this.context?.close().catch(() => {}); }
}
