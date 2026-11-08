// Startup Play. The first tap owns audio unlock, one welcome, and one transition.
// Further taps while that attempt is running, or after it has succeeded, do nothing — they must not
// queue another "Hi, I'm Kit" onto the serial audio queue (that greeting then plays over the next screen).
// If unlock or playback throws, the attempt is idle again so a later tap can retry.
export function createHelloGate() {
  let phase = 'idle'; // idle | running | done
  return {
    get phase() { return phase; },
    async start({ unlock, play, go }) {
      if (phase !== 'idle') return false;
      phase = 'running';
      try {
        await unlock();
        await play();
        go();
        phase = 'done';
        return true;
      } catch (err) {
        if (phase === 'running') phase = 'idle';
        throw err;
      }
    },
  };
}
