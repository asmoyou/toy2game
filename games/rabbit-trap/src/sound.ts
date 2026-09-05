let context: AudioContext | null = null;
let enabled = false;

export function isSoundEnabled() {
  return enabled;
}

export function setSound(value: boolean) {
  enabled = value;
  if (value) {
    context ??= new AudioContext();
    void context.resume();
  }
}

export function playSound(
  kind:
    | "draw"
    | "hop"
    | "trap"
    | "win"
    | "collect"
    | "mechanism"
    | "spring"
    | "wind"
    | "slide"
    | "thunder",
) {
  if (!enabled || !context) return;
  const notes =
    kind === "thunder"
      ? [105, 75, 55, 42]
      : kind === "mechanism"
        ? [160, 110, 180, 110]
        : kind === "spring"
          ? [220, 440, 880, 1100]
          : kind === "wind"
            ? [480, 340, 210]
            : kind === "slide"
              ? [760, 580, 420, 300]
              : kind === "collect"
                ? [784, 988, 1175]
                : kind === "win"
                  ? [523, 659, 784, 1047]
                  : kind === "trap"
                    ? [220, 146, 82]
                    : kind === "hop"
                      ? [480, 720]
                      : [620, 880];
  notes.forEach((frequency, i) => {
    const oscillator = context!.createOscillator();
    const gain = context!.createGain();
    const time = context!.currentTime + i * 0.09;
    oscillator.type =
      kind === "mechanism" || kind === "thunder" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, time);
    if (kind === "spring" || kind === "slide" || kind === "wind")
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency * (kind === "spring" ? 1.4 : 0.65),
        time + 0.2,
      );
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.065, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
    oscillator.connect(gain);
    gain.connect(context!.destination);
    oscillator.start(time);
    oscillator.stop(time + 0.27);
  });
}
