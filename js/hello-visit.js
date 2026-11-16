// One visit to the Kit intro. beginVisit() runs every time that screen is shown: it arms the gate
// and clears Play's accepted state. press() accepts the button first, then asks the gate.
// A second press while the greeting is running leaves the button accepted (one greeting).
// A press the gate refuses for any other reason, or a throw, re-enables Play so .going
// (pointer-events: none) cannot swallow the next real tap.
export function createHelloVisit({ gate, play }) {
  const accept = () => {
    play.classList.add('going');
    play.setAttribute('aria-disabled', 'true');
    play.setAttribute('aria-busy', 'true');
  };
  const release = () => {
    play.classList.remove('going');
    play.removeAttribute('aria-disabled');
    play.removeAttribute('aria-busy');
  };
  return {
    beginVisit() {
      gate.reset();
      release();
    },
    press(attempt) {
      accept();
      return Promise.resolve(gate.start(attempt)).then(ok => {
        if (ok === false && gate.phase !== 'running') release();
        return ok;
      }, err => {
        release();
        throw err;
      });
    },
  };
}
