// One visit to the Kit intro. beginVisit() runs every time that screen is shown: it arms the gate
// and clears Play's accepted state. press() hides Play first, then asks the gate.
// A second press while the greeting is running leaves Play hidden (one greeting).
// A press the gate refuses for any other reason, or a throw, shows Play again so the next tap works.
// .going / [hidden] are display:none and pointer-events:none; disabled blocks activation too.
export function createHelloVisit({ gate, play }) {
  const accept = () => {
    play.classList.add('going');
    play.hidden = true;
    play.disabled = true;
    play.setAttribute('aria-disabled', 'true');
    play.setAttribute('aria-busy', 'true');
  };
  const release = () => {
    play.classList.remove('going');
    play.hidden = false;
    play.disabled = false;
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
