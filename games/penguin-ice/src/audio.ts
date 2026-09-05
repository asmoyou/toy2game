export class GameAudio {
  enabled = true;
  private context?: AudioContext;

  unlock() {
    if (!this.enabled) return;
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
  }

  private note(frequency: number, duration: number, delay = 0, type: OscillatorType = 'sine', volume = 0.09) {
    if (!this.enabled || !this.context) return;
    const context = this.context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.6, start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  hit() {
    this.note(720, 0.07, 0, 'triangle', 0.16);
    this.note(1600, 0.13, 0.035, 'sine', 0.08);
    this.note(210, 0.1, 0, 'triangle', 0.12);
  }

  turn() { this.note(880, 0.14); }
  fall() { [600, 480, 360, 220].forEach((frequency, i) => this.note(frequency, 0.24, i * 0.13, 'triangle')); }
  start() { [520, 660, 880].forEach((frequency, i) => this.note(frequency, 0.18, i * 0.09)); }
  win() { [523, 659, 784, 1046].forEach((frequency, i) => this.note(frequency, 0.28, i * 0.13, 'triangle', 0.065)); }
}
