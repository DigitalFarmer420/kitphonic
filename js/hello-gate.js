// Startup Play. The first tap of a visit owns audio unlock, one welcome, and one transition.
// Further taps while that attempt is running, or after it has succeeded, do nothing — they must not
// queue another "Hi, I'm Kit" onto the serial audio queue (that greeting then plays over the next screen).
// If unlock or playback throws, the attempt is idle again so a later tap can retry.
// The map's Home button shows the intro again in the same session. reset() arms one more greeting.
// It is not called on its own: within one visit a success still cannot be tried again.
export function createHelloGate({ onPhase } = {}) {
  let phase = 'idle'; // idle | running | done
  let generation = 0;
  const setPhase = (next) => {
    if (phase === next) return;
    const from = phase;
    phase = next;
    onPhase?.(next, from);
  };
  return {
    get phase() { return phase; },
    reset() {
      generation += 1;
      setPhase('idle');
    },
    async start({ unlock, play, go }) {
      if (phase !== 'idle') return false;
      const gen = generation;
      setPhase('running');
      try {
        await unlock();
        if (gen !== generation) return false;
        await play();
        if (gen !== generation) return false;
        go();
        if (gen !== generation) return false;
        setPhase('done');
        return true;
      } catch (err) {
        if (gen === generation && phase === 'running') setPhase('idle');
        throw err;
      }
    },
  };
}
