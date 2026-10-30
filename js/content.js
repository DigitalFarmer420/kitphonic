import { GPC } from './sequence.js';
// Kitphonic prototype content (spec §3.3.1, §3.6, §3.7, §3.9). Pure data, no DOM.
// Every word decodes from GPCs taught by its level's reach (validate.LEVEL_K); the runtime untaught-sound check
// (validate.servable) serves a word only once each of its sounds is known.
// `pic`: emoji placeholder, or '#id' for an inline SVG symbol in index.html. Placeholder art only.

export const LETTER_INFO = {
  //       name text  name tts   sound text  sound tts  held tts (stretchy only)
  m: { name: 'M', nameTts: 'em',  sound: 'm', soundTts: 'mm',  heldTts: 'mmmmmm' },
  s: { name: 'S', nameTts: 'ess', sound: 's', soundTts: 'ss',  heldTts: 'ssssss' },
  a: { name: 'A', nameTts: 'ay',  sound: 'a (apple)', soundTts: 'aah', heldTts: 'aaaaah' },
  t: { name: 'T', nameTts: 'tee', sound: 't', soundTts: 'tuh' },
  p: { name: 'P', nameTts: 'pee', sound: 'p', soundTts: 'puh' },
  i: { name: 'I', nameTts: 'eye', sound: 'i (itch)', soundTts: 'ih', heldTts: 'iiiih' },
  n: { name: 'N', nameTts: 'en',  sound: 'n', soundTts: 'nn',  heldTts: 'nnnnnn' },
  o: { name: 'O', nameTts: 'oh',  sound: 'o (top)', soundTts: 'aw', heldTts: 'awwww' },
  // sets 3–5 (sequence.js)
  d: { name: 'D', nameTts: 'dee', sound: 'd', soundTts: 'duh' },
  f: { name: 'F', nameTts: 'eff', sound: 'f', soundTts: 'ff', heldTts: 'ffffff' },
  c: { name: 'C', nameTts: 'see', sound: 'c (cat)', soundTts: 'kuh' },
  k: { name: 'K', nameTts: 'kay', sound: 'k', soundTts: 'kuh' },
  e: { name: 'E', nameTts: 'ee', sound: 'e (egg)', soundTts: 'eh', heldTts: 'ehhhh' },
  u: { name: 'U', nameTts: 'you', sound: 'u (up)', soundTts: 'uh', heldTts: 'uhhhh' },
  g: { name: 'G', nameTts: 'jee', sound: 'g (go)', soundTts: 'guh' },
  r: { name: 'R', nameTts: 'ar', sound: 'r', soundTts: 'rr', heldTts: 'rrrrrr' },
  h: { name: 'H', nameTts: 'aitch', sound: 'h', soundTts: 'hh' },
  b: { name: 'B', nameTts: 'bee', sound: 'b', soundTts: 'buh' },
  l: { name: 'L', nameTts: 'el', sound: 'l', soundTts: 'll', heldTts: 'llllll' },
  // set 6: doubles say the same sound as the single letter; s can say /z/ (is, as)
  ck: { sound: 'ck (duck)', soundTts: 'kuh', digraph: true },
  ff: { sound: 'ff', soundTts: 'ff', heldTts: 'ffffff', digraph: true },
  ll: { sound: 'll', soundTts: 'll', heldTts: 'llllll', digraph: true },
  ss: { sound: 'ss', soundTts: 'ss', heldTts: 'ssssss', digraph: true },
  s_z: { sound: 's says z (is)', soundTts: 'zz', heldTts: 'zzzzzz', noName: true },
  // set 7
  j: { name: 'J', nameTts: 'jay', sound: 'j', soundTts: 'juh' },
  v: { name: 'V', nameTts: 'vee', sound: 'v', soundTts: 'vv', heldTts: 'vvvvvv' },
  w: { name: 'W', nameTts: 'double you', sound: 'w', soundTts: 'wuh' },
  x: { name: 'X', nameTts: 'ex', sound: 'x (box)', soundTts: 'ks' },
  y: { name: 'Y', nameTts: 'why', sound: 'y (yes)', soundTts: 'yuh' },
  z: { name: 'Z', nameTts: 'zee', sound: 'z', soundTts: 'zz', heldTts: 'zzzzzz' }, // ⚠️ 'zee' (US) vs 'zed' (UK) awaits the accent decision
  zz: { sound: 'zz', soundTts: 'zz', heldTts: 'zzzzzz', digraph: true },
  qu: { sound: 'qu (queen)', soundTts: 'kw', digraph: true },
  // set 8 digraphs (words-board 3): two letters, one sound — no letter-name clip, never sounded out as /s/-/h/
  sh: { sound: 'sh', soundTts: 'shh', heldTts: 'shhhhhh', digraph: true },
  ch: { sound: 'ch', soundTts: 'ch', digraph: true },
  th: { sound: 'th (thin)', soundTts: 'thh', heldTts: 'thhhhh', digraph: true },
  th_v: { sound: 'th (that)', soundTts: 'the', heldTts: 'thhhhh', digraph: true },
  ng: { sound: 'ng (ring)', soundTts: 'ng', heldTts: 'nggggg', digraph: true },
  nk: { sound: 'nk (pink)', soundTts: 'nk', digraph: true },
};

// Letter-intro pictures (design/letters-board 1b): words that START with the sound (x: ends), rotated per visit so a
// sound is never tied to one picture. Placeholder emoji art. v2 V10: the word is printed (its letter in coral) only when
// the child can decode it at that point (lesson-screen introLabel); otherwise the picture + the big letter only.
// A null picture = a decodable word shown as print alone (it, on, off). Misnamed pictures replaced (insect, ink, ox,
// teddy, yak, cliff, feather, jet, zip, cup, net, king, sink).
export const LETTER_PICS = {
  m: [['moon', '🌙'], ['mouse', '🐭'], ['map', '🗺️']], s: [['sun', '☀️'], ['sock', '🧦'], ['seal', '🦭']],
  a: [['apple', '🍎'], ['ant', '🐜'], ['alligator', '🐊']], t: [['tiger', '🐯'], ['tent', '⛺']],
  p: [['pig', '🐷'], ['penguin', '🐧'], ['pan', '🍳']], i: [['it', null]],
  n: [['nest', '🪺'], ['nose', '👃'], ['nut', '🥜']], o: [['octopus', '🐙'], ['otter', '🦦'], ['on', null]],
  d: [['dog', '🐶'], ['duck', '🦆']], f: [['fish', '🐟'], ['fox', '🦊']], c: [['cat', '🐈'], ['cap', '🧢']],
  k: [['kite', '🪁'], ['key', '🔑']], e: [['egg', '🥚'], ['elephant', '🐘']], u: [['umbrella', '☂️'], ['up', '⬆️']],
  g: [['goat', '🐐'], ['gift', '🎁']], r: [['rabbit', '🐇'], ['rocket', '🚀']], h: [['hat', '🎩'], ['horse', '🐴']],
  b: [['bus', '🚌'], ['bed', '🛏️']], l: [['lion', '🦁'], ['leaf', '🍃']], j: [['jellyfish', '🪼'], ['jump', null]],
  v: [['van', '🚐'], ['violin', '🎻']], w: [['web', '🕸️'], ['worm', '🪱']], x: [['fox', '🦊'], ['box', '📦']],
  y: [['yo-yo', '🪀'], ['yes', null]], z: [['zebra', '🦓']], qu: [['queen', '👸']],
  sh: [['ship', '🚢'], ['sheep', '🐑']], ch: [['chick', '🐤'], ['cheese', '🧀']], th: [['thumb', '👍']],
  ng: [['ring', '💍'], ['sing', '🎤']], ck: [['duck', '🦆'], ['sock', '🧦']], ll: [['bell', '🔔'], ['doll', '🪆']],
  ss: [['dress', '👗']], s_z: [['nose', '👃'], ['rose', '🌹']], th_v: [['that', '👉']], ff: [['off', null], ['puff', '💨']], zz: [['buzz', '🐝']], nk: [['wink', '😉'], ['pink', '🩷']],
};

// Level ladder (§3.7) — review R5 data model. Each word: text, parse (GPC ids from js/sequence.js, space-separated),
// level, optional pic (picturable + unambiguous), say (Kit's reveal line). `pattern`, `phonemes`, `w` are derived.
// tests/content.test.mjs validates every entry (parse integrity, taught GPCs only, level pattern, audio coverage).
// Words without `pic` skip the picture check and get a spoken sentence instead (spec open question 1).
const W = (text, parse, extra = {}) => ({ text, parse, ...extra });
export const WORDS = {
  1: [ // VC
    W('at', 'a t', { say: 'At! Look at me.' }), W('am', 'a m', { say: 'Am! I am Kit.' }), W('an', 'a n', { say: 'An! An apple.' }),
    W('in', 'i n', { say: 'In! In the box.' }), W('it', 'i t', { say: 'It! I got it.' }), W('on', 'o n', { say: 'On! On the mat.' }),
    // later sets (served only once every sound is known)
    W('if', 'i f', { say: 'If! If you can.' }), W('up', 'u p', { pic: '⬆️', say: 'Up! Up we go.' }), W('us', 'u s', { say: 'Us! Come with us.' }),
    W('off', 'o ff', { say: 'Off! Lights off.' }), W('is', 'i s_z', { say: 'Is! It is fun.' }), W('as', 'a s_z', { say: 'As! As big as a bus.' }),
  ],
  2: [ // CVC (display: onset + rime by default — ⚠️ L2 blend style awaits user decision)
    W('mat', 'm a t', { pic: '#mat' }), W('map', 'm a p', { pic: '🗺️' }), W('tap', 't a p', {}),
    W('pan', 'p a n', { pic: '🍳' }), W('man', 'm a n', { pic: '👨' }), W('pin', 'p i n', { pic: '📌' }),
    W('sat', 's a t', { say: 'Sat! The cat sat.' }), W('nap', 'n a p', { say: 'Nap! Time for a nap.' }),
    W('sip', 's i p', { say: 'Sip! Take a sip.' }), W('tin', 't i n', { say: 'Tin! A tin can.' }),
    W('pat', 'p a t', { say: 'Pat! Pat the dog.' }), W('sap', 's a p', { say: 'Sap! Sticky tree sap.' }),
  ],
  3: [ // CVC, all phonemes. map/pan re-read sound-by-sound (spec L3 examples)
    // v2 V8: >= 12 words at the L3 stop (m s a t p i n): the L2 words re-read sound by sound, plus nip / tan
    W('mat', 'm a t', { pic: '#mat' }), W('man', 'm a n', { pic: '👨' }), W('pin', 'p i n', { pic: '📌' }), W('tap', 't a p', { say: 'Tap! Tap the drum.' }),
    W('sat', 's a t', { say: 'Sat! The cat sat.' }), W('nap', 'n a p', { say: 'Nap! Time for a nap.' }), W('sip', 's i p', { say: 'Sip! Take a sip.' }),
    W('tin', 't i n', { say: 'Tin! A tin can.' }), W('nip', 'n i p', { say: 'Nip! The crab can nip.' }), W('tan', 't a n', { say: 'Tan! A tan dog.' }),
    W('pot', 'p o t', { pic: '🍲' }), W('mop', 'm o p', {}), W('map', 'm a p', { pic: '🗺️' }), W('pan', 'p a n', { pic: '🍳' }),
    W('sit', 's i t', { say: 'Sit! Sit down.' }), W('pop', 'p o p', { say: 'Pop! Pop the bubble.' }),
    W('top', 't o p', { say: 'Top! Spin the top.' }), W('tip', 't i p', { say: 'Tip! The tip of my nose.' }),
    W('not', 'n o t', { say: 'Not! Not now.' }), W('hit', 'h i t', { say: 'Hit! Hit the ball.' }),
    // set 3: o d f
    W('dog', 'd o g', { pic: '🐶', say: 'Dog! A happy dog.' }), W('dot', 'd o t', { pic: '⚫', say: 'Dot! A little dot.' }), W('fan', 'f a n', { pic: '🪭', say: 'Fan! A cool fan.' }),
    W('fin', 'f i n', { say: 'Fin! A fish has a fin.' }), W('dip', 'd i p', { say: 'Dip! Dip your toes.' }), W('nod', 'n o d', { say: 'Nod! Nod your head.' }),
    W('sad', 's a d', { say: 'Sad! Not sad today.' }), W('get', 'g e t', { say: 'Get! Get the ball.' }), W('dad', 'd a d', { say: 'Dad! Hi, Dad!' }), W('fit', 'f i t', { say: 'Fit! It fits.' }),
    // set 4: c k e u
    W('cat', 'c a t', { pic: '#cat', say: 'Cat! The cat sat.' }), W('cap', 'c a p', { pic: '🧢', say: 'Cap! A red cap.' }), W('cup', 'c u p', { say: 'Cup! A cup of milk.' }),
    W('pen', 'p e n', { pic: '🖊️', say: 'Pen! Write with a pen.' }), W('net', 'n e t', { say: 'Net! In the net.' }), W('nut', 'n u t', { pic: '🥜', say: 'Nut! A crunchy nut.' }),
    W('sun', 's u n', { pic: '☀️', say: 'Sun! The hot sun.' }), W('can', 'c a n', { pic: '🥫', say: 'Can! A tin can.' }), W('kid', 'k i d', { say: 'Kid! A happy kid.' }),
    W('kit', 'k i t', { say: 'Kit! That is me!' }), W('ten', 't e n', { say: 'Ten! Count to ten.' }), W('pet', 'p e t', { say: 'Pet! A pet cat.' }), W('cut', 'c u t', { say: 'Cut! Cut the paper.' }),
    W('mud', 'm u d', { say: 'Mud! Muddy boots.' }), W('fun', 'f u n', { say: 'Fun! That was fun.' }), W('den', 'd e n', { say: 'Den! The fox is in its den.' }),
    // set 5: g r h b l
    W('bag', 'b a g', { say: 'Bag! A big bag.' }), W('bed', 'b e d', { pic: '🛏️', say: 'Bed! Time for bed.' }), W('bus', 'b u s', { pic: '🚌', say: 'Bus! Get on the bus.' }),
    W('bat', 'b a t', { pic: '🦇', say: 'Bat! A bat can fly.' }), W('bin', 'b i n', { pic: '🗑️', say: 'Bin! In the bin.' }), W('bug', 'b u g', { pic: '🐛', say: 'Bug! A little bug.' }),
    W('hat', 'h a t', { pic: '#hat', say: 'Hat! A big hat.' }), W('hen', 'h e n', { pic: '🐔', say: 'Hen! The hen sat.' }), W('leg', 'l e g', { pic: '🦵', say: 'Leg! Hop on one leg.' }),
    W('log', 'l o g', { pic: '🪵', say: 'Log! A big log.' }), W('rat', 'r a t', { pic: '🐀', say: 'Rat! A rat ran.' }), W('pig', 'p i g', { pic: '🐷', say: 'Pig! A pink pig.' }),
    W('tag', 't a g', { pic: '🏷️', say: 'Tag! A name tag.' }), W('big', 'b i g', { say: 'Big! So big!' }), W('hop', 'h o p', { say: 'Hop! Hop like a frog.' }),
    W('hot', 'h o t', { say: 'Hot! It is hot.' }), W('hug', 'h u g', { say: 'Hug! A big hug.' }), W('red', 'r e d', { say: 'Red! A red ball.' }), W('run', 'r u n', { say: 'Run! Run fast.' }),
    W('lid', 'l i d', { say: 'Lid! Put the lid on.' }), W('got', 'g o t', { say: 'Got! I got it.' }), W('dig', 'd i g', { say: 'Dig! Dig a hole.' }), W('ran', 'r a n', { say: 'Ran! The dog ran.' }),
    W('rug', 'r u g', { say: 'Rug! A soft rug.' }), W('had', 'h a d', { say: 'Had! I had fun.' }), W('gum', 'g u m', { say: 'Gum! Chewing gum.' }), W('lot', 'l o t', { say: 'Lot! A lot of toys.' }), W('bun', 'b u n', { say: 'Bun! A hot bun.' }),
    // set 6: ck ff ll ss, s = /z/
    W('duck', 'd u ck', { pic: '🦆', say: 'Duck! Quack, quack.' }), W('sock', 's o ck', { pic: '🧦', say: 'Sock! A warm sock.' }), W('lock', 'l o ck', { pic: '🔒', say: 'Lock! Lock the door.' }),
    W('bell', 'b e ll', { pic: '🔔', say: 'Bell! Ring the bell.' }), W('doll', 'd o ll', { pic: '🪆', say: 'Doll! A little doll.' }), W('hill', 'h i ll', { say: 'Hill! Up the hill.' }),
    W('kick', 'k i ck', { say: 'Kick! Kick the ball.' }), W('back', 'b a ck', { say: 'Back! Come back.' }), W('neck', 'n e ck', { say: 'Neck! A long neck.' }), W('rock', 'r o ck', { say: 'Rock! A big rock.' }), W('sick', 's i ck', { say: 'Sick! Not sick now.' }),
    W('tell', 't e ll', { say: 'Tell! Tell me.' }), W('fell', 'f e ll', { say: 'Fell! It fell down.' }), W('kiss', 'k i ss', { say: 'Kiss! A goodnight kiss.' }), W('mess', 'm e ss', { say: 'Mess! What a mess.' }),
    W('puff', 'p u ff', { say: 'Puff! Puff of smoke.' }), W('his', 'h i s_z', { say: 'His! His hat.' }), W('has', 'h a s_z', { say: 'Has! She has a cat.' }),
    // set 7: j v w x y z zz qu
    W('jam', 'j a m', { say: 'Jam! Jam on toast.' }), W('jet', 'j e t', { say: 'Jet! A fast jet.' }), W('van', 'v a n', { pic: '🚐', say: 'Van! A big van.' }),
    W('web', 'w e b', { pic: '🕸️', say: 'Web! A spider web.' }), W('box', 'b o x', { pic: '📦', say: 'Box! In the box.' }), W('fox', 'f o x', { pic: '🦊', say: 'Fox! A red fox.' }),
    W('zip', 'z i p', { say: 'Zip! Zip it up.' }), W('buzz', 'b u zz', { pic: '🐝', say: 'Buzz! Buzz, buzz, bee.' }), W('wig', 'w i g', { say: 'Wig! A funny wig.' }),
    W('wet', 'w e t', { say: 'Wet! Wet socks.' }), W('win', 'w i n', { say: 'Win! We win!' }), W('six', 's i x', { say: 'Six! Six legs.' }), W('mix', 'm i x', { say: 'Mix! Mix it up.' }),
    W('yes', 'y e s', { say: 'Yes! Yes, please.' }), W('yum', 'y u m', { say: 'Yum! Yum, yum.' }), W('vet', 'v e t', { say: 'Vet! The vet helps pets.' }), W('jog', 'j o g', { say: 'Jog! Jog to the park.' }),
    W('fizz', 'f i zz', { say: 'Fizz! Fizzy drink.' }), W('quiz', 'qu i z', { say: 'Quiz! A fun quiz.' }), W('quit', 'qu i t', { say: 'Quit! Never quit.' }),
  ],
  6: [ // digraph sh (sequence set 8; L5 = CVCC final blends is reserved): one joined sky tile, one slider stop per SOUND (ship = 3 stops)
    W('ship', 'sh i p', { pic: '🚢', say: 'Ship! A big ship.' }), W('shop', 'sh o p', { pic: '🏪', say: 'Shop! A little shop.' }),
    W('fish', 'f i sh', { pic: '🐟', say: 'Fish! A fish can swim.' }), W('dish', 'd i sh', { say: 'Dish! A dish for dinner.' }),
    W('dash', 'd a sh', { say: 'Dash! Dash to the door.' }), W('shed', 'sh e d', { say: 'Shed! A garden shed.' }),
    W('shut', 'sh u t', { say: 'Shut! Shut the door.' }), W('shin', 'sh i n', { say: 'Shin! I bumped my shin.' }),
    W('shell', 'sh e ll', { pic: '🐚', say: 'Shell! A sea shell.' }), W('rush', 'r u sh', { say: 'Rush! No need to rush.' }),
    W('wish', 'w i sh', { say: 'Wish! Make a wish.' }), W('shock', 'sh o ck', { say: 'Shock! What a shock!' }), W('hush', 'h u sh', { say: 'Hush! The baby is asleep.' }),
    // ch
    W('chip', 'ch i p', { say: 'Chip! A chip of wood.' }), W('chop', 'ch o p', { say: 'Chop! Chop the wood.' }), W('chin', 'ch i n', { say: 'Chin! Touch your chin.' }),
    W('chick', 'ch i ck', { pic: '🐤', say: 'Chick! A fluffy chick.' }), W('much', 'm u ch', { say: 'Much! Thank you so much.' }), W('chat', 'ch a t', { say: 'Chat! A chat with a friend.' }),
    W('lunch', 'l u n ch', { say: 'Lunch! Time for lunch.' }), W('chest', 'ch e s t', { say: 'Chest! A treasure chest.' }), W('bench', 'b e n ch', { say: 'Bench! Sit on the bench.' }),
    // th (thin) and th (that)
    W('thin', 'th i n', { say: 'Thin! A thin stick.' }), W('bath', 'b a th', { pic: '🛁', say: 'Bath! Bath time.' }), W('moth', 'm o th', { say: 'Moth! A moth at night.' }),
    W('path', 'p a th', { say: 'Path! Walk on the path.' }), W('thick', 'th i ck', { say: 'Thick! A thick book.' }),
    W('that', 'th_v a t', { say: 'That! Look at that.' }), W('this', 'th_v i s', { say: 'This! I like this.' }), W('them', 'th_v e m', { say: 'Them! Give it to them.' }), W('then', 'th_v e n', { say: 'Then! And then?' }),
    // ng, nk
    W('ring', 'r i ng', { pic: '💍', say: 'Ring! A gold ring.' }), W('king', 'k i ng', { say: 'King! The king sat.' }), W('wing', 'w i ng', { say: 'Wing! A bird wing.' }),
    W('song', 's o ng', { say: 'Song! Sing a song.' }), W('long', 'l o ng', { say: 'Long! A long snake.' }), W('sing', 's i ng', { say: 'Sing! Sing with me.' }), W('thing', 'th i ng', { say: 'Thing! A funny thing.' }),
    W('sink', 's i nk', { say: 'Sink! Wash in the sink.' }), W('pink', 'p i nk', { say: 'Pink! A pink pig.' }), W('bank', 'b a nk', { pic: '🏦', say: 'Bank! Money in the bank.' }),
    W('tank', 't a nk', { say: 'Tank! A fish tank.' }), W('wink', 'w i nk', { say: 'Wink! Wink at me.' }), W('think', 'th i nk', { say: 'Think! Let me think.' }),
  ],
  4: [ // CCVC: starting blend; each blend consonant its own dot
    W('stop', 's t o p', { pic: '🛑', say: 'Stop!' }), W('spot', 's p o t', { say: 'Spot! A spotty dog.' }),
    W('snap', 's n a p', { say: 'Snap! Snap your fingers.' }), W('spin', 's p i n', { say: 'Spin! Spin around.' }),
    W('snip', 's n i p', { say: 'Snip! Snip the paper.' }), // v2 V6: spit / spat removed (unsuitable / obscure)
    // later sets
    W('step', 's t e p', { say: 'Step! One more step.' }), W('skip', 's k i p', { say: 'Skip! Skip along.' }), W('flag', 'f l a g', { pic: '🚩', say: 'Flag! A red flag.' }),
    W('frog', 'f r o g', { pic: '🐸', say: 'Frog! A green frog.' }), W('drum', 'd r u m', { pic: '🥁', say: 'Drum! Bang the drum.' }), W('crab', 'c r a b', { pic: '🦀', say: 'Crab! A red crab.' }),
    W('plug', 'p l u g', { pic: '🔌', say: 'Plug! Plug it in.' }), W('clap', 'c l a p', { pic: '👏', say: 'Clap! Clap your hands.' }), W('grin', 'g r i n', { say: 'Grin! A big grin.' }),
    W('trip', 't r i p', { say: 'Trip! A fun trip.' }), W('drop', 'd r o p', { say: 'Drop! Do not drop it.' }), W('flip', 'f l i p', { say: 'Flip! Flip it over.' }),
    W('glad', 'g l a d', { say: 'Glad! I am glad.' }), W('plan', 'p l a n', { say: 'Plan! A good plan.' }), W('slip', 's l i p', { say: 'Slip! Do not slip.' }),
    W('clock', 'c l o ck', { pic: '⏰', say: 'Clock! Tick tock, clock.' }), W('dress', 'd r e ss', { pic: '👗', say: 'Dress! A party dress.' }), W('truck', 't r u ck', { pic: '🚚', say: 'Truck! A big truck.' }),
    W('smell', 's m e ll', { say: 'Smell! Smell the flower.' }), W('swim', 's w i m', { say: 'Swim! Swim like a fish.' }), W('twin', 't w i n', { say: 'Twin! My twin.' }),
  ],
  7: [ // v2 V4f: -s suffix after s = /z/: stem + s (/s/ after a voiceless sound, /z/ otherwise). stem: a word above
    W('cats', 'c a t s', { stem: 'cat', say: 'Cats! Two cats.' }), W('hats', 'h a t s', { stem: 'hat', say: 'Hats! Lots of hats.' }),
    W('cups', 'c u p s', { stem: 'cup', say: 'Cups! Two cups.' }), W('pots', 'p o t s', { stem: 'pot', say: 'Pots! Pots and pans.' }),
    W('maps', 'm a p s', { stem: 'map', say: 'Maps! Two maps.' }), W('nuts', 'n u t s', { stem: 'nut', say: 'Nuts! A bag of nuts.' }),
    W('pets', 'p e t s', { stem: 'pet', say: 'Pets! Cats and dogs are pets.' }), W('its', 'i t s', { stem: 'it', say: 'Its! The cat licks its paw.' }),
    W('bags', 'b a g s_z', { stem: 'bag', say: 'Bags! Two bags.' }), W('pigs', 'p i g s_z', { stem: 'pig', say: 'Pigs! Three pigs.' }),
    W('dogs', 'd o g s_z', { stem: 'dog', say: 'Dogs! Two dogs.' }), W('beds', 'b e d s_z', { stem: 'bed', say: 'Beds! Bunk beds.' }),
    W('hens', 'h e n s_z', { stem: 'hen', say: 'Hens! The hens sat.' }), W('bugs', 'b u g s_z', { stem: 'bug', say: 'Bugs! Little bugs.' }),
    W('pens', 'p e n s_z', { stem: 'pen', say: 'Pens! Red pens.' }), W('legs', 'l e g s_z', { stem: 'leg', say: 'Legs! Two legs.' }),
    W('rugs', 'r u g s_z', { stem: 'rug', say: 'Rugs! Soft rugs.' }), W('gets', 'g e t s', { stem: 'get', say: 'Gets! He gets wet.' }),
  ],
  5: [ // CVCC: final blend; each consonant its own dot (sand = 4 stops)
    W('sand', 's a n d', { say: 'Sand! Sand at the beach.' }), W('pond', 'p o n d', { say: 'Pond! Ducks on the pond.' }), W('best', 'b e s t', { say: 'Best! You are the best.' }),
    W('past', 'p a s t', { say: 'Past! The bus went past.' }), W('fast', 'f a s t', { say: 'Fast! So fast!' }), W('soft', 's o f t', { say: 'Soft! A soft pillow.' }),
    W('camp', 'c a m p', { say: 'Camp! We camp in a tent.' }), W('mint', 'm i n t', { say: 'Mint! A mint leaf.' }),
    W('hand', 'h a n d', { pic: '✋', say: 'Hand! Wave your hand.' }), W('tent', 't e n t', { pic: '⛺', say: 'Tent! A tent for camping.' }), W('milk', 'm i l k', { pic: '🥛', say: 'Milk! A glass of milk.' }),
    W('nest', 'n e s t', { pic: '🪺', say: 'Nest! A bird nest.' }), W('lamp', 'l a m p', { say: 'Lamp! Turn on the lamp.' }), W('gift', 'g i f t', { pic: '🎁', say: 'Gift! A gift for you.' }),
    W('vest', 'v e s t', { say: 'Vest! A bright vest.' }), W('desk', 'd e s k', { say: 'Desk! Sit at the desk.' }), W('dust', 'd u s t', { say: 'Dust! Dust on the shelf.' }),
    W('help', 'h e l p', { say: 'Help! Can I help?' }), W('jump', 'j u m p', { say: 'Jump! Jump up high.' }), W('just', 'j u s t', { say: 'Just! Just one more cookie.' }),
    W('land', 'l a n d', { say: 'Land! Land the plane.' }), W('last', 'l a s t', { say: 'Last! The last one.' }), W('left', 'l e f t', { say: 'Left! Turn left.' }),
    W('lift', 'l i f t', { say: 'Lift! Lift it up.' }), W('lost', 'l o s t', { say: 'Lost! I lost my sock.' }), W('melt', 'm e l t', { say: 'Melt! The snow will melt.' }),
    W('must', 'm u s t', { say: 'Must! We must brush our teeth.' }), W('rest', 'r e s t', { say: 'Rest! Time to rest.' }), W('went', 'w e n t', { say: 'Went! We went home.' }),
    W('band', 'b a n d', { say: 'Band! A band plays music.' }), W('hunt', 'h u n t', { say: 'Hunt! A treasure hunt.' }),
    W('next', 'n e x t', { say: 'Next! You are next on the slide.' }), W('bump', 'b u m p', { say: 'Bump! A big bump.' }),
    // VCC (v2 V4g): and is one of the most frequent words in English
    W('and', 'a n d', { say: 'And! Cats and dogs.' }), W('ant', 'a n t', { say: 'Ant! A little ant.' }), W('end', 'e n d', { say: 'End! The end.' }),
    W('ask', 'a s k', { say: 'Ask! Ask a friend.' }), W('elf', 'e l f', { say: 'Elf! A tiny elf.' }), W('belt', 'b e l t', { say: 'Belt! A brown belt.' }),
  ],
};
for (const [lv, list] of Object.entries(WORDS)) for (const e of list) {
  e.level = +lv; e.w = e.text; e.say ??= `A ${e.text}!`;
  const ids = e.parse.split(' '); e.phonemes = ids.map(id => GPC[id]?.phoneme); e.pattern = ids.map(id => (GPC[id]?.vowel ? 'V' : 'C')).join('');
}

// Picture-only distractors for the check (pictured + spoken, never printed, so untaught GPCs are fine).
// `ph` = GPC ids of the spoken phonemes; R8: each distractor differs from its target by exactly one phoneme.
export const PICTURE_POOL = [
  { text: 'hat', pic: '#hat', ph: 'h a t' }, { text: 'cat', pic: '#cat', ph: 'c a t' }, { text: 'bat', pic: '🦇', ph: 'b a t' },
  { text: 'rat', pic: '🐀', ph: 'r a t' }, { text: 'cap', pic: '🧢', ph: 'c a p' },
  { text: 'fan', pic: '🪭', ph: 'f a n' }, { text: 'van', pic: '🚐', ph: 'v a n' }, { text: 'pen', pic: '🖊️', ph: 'p e n' },
  { text: 'bin', pic: '🗑️', ph: 'b i n' }, { text: 'pig', pic: '🐷', ph: 'p i g' },
  { text: 'tag', pic: '🏷️', ph: 't a g' }, { text: 'dot', pic: '⚫', ph: 'd o t' },
  { text: 'chop', pic: '🪓', ph: 'ch o p' },
];
for (const p of PICTURE_POOL) p.phonemes = p.ph.split(' ').map(id => GPC[id].phoneme);

// Star (tricky) words — literacy review R6 (⚠️ list still an open user decision; spec §3.6 had was/said/of/to/you).
// parse: GPC ids for regular parts; { g, ph, irregular: true } marks the "tricky part" (heart grapheme).
// introAfter: GPC ids that must be taught first, plus optional prerequisite star word.
const IRR = (g, ph) => ({ g, ph, irregular: true });
export const STAR_WORDS = [
  { w: 'I',    level: 2, parse: [IRR('I', 'aɪ')],              introAfter: { gpcs: ['i'] }, say: 'I can see Kit.', capital: true },
  { w: 'the',  level: 2, parse: [IRR('th', 'ð'), IRR('e', 'ə')], introAfter: { gpcs: ['m', 's', 'a', 't'] }, say: 'The cat sat on the mat.' }, // at blending unlock
  { w: 'is',   level: 3, parse: ['i', IRR('s', 'z')],          graduates: 's_z', introAfter: { gpcs: ['s', 'i'] }, say: 'It is a map.' },
  { w: 'to',   level: 3, parse: ['t', IRR('o', 'uː')],         introAfter: { gpcs: ['t', 'o'] }, say: 'Go to the top.' },
  { w: 'no',   level: 4, parse: ['n', IRR('o', 'oʊ')],         introAfter: { gpcs: ['n', 'o'] }, say: 'No, not now.', note: '⚠️ o = /oʊ/ (US) or /əʊ/ (UK)' },
  { w: 'into', level: 4, parse: ['i', 'n', 't', IRR('o', 'uː')], introAfter: { gpcs: ['i', 'n', 't', 'o'], star: 'to' }, say: 'Pop it into the pot.' },
  // v2 V5: the schedule beyond "into" (regular parts taught first; <= 2 new per level). ⚠️ accent-dependent vowels noted.
  { w: 'a',    level: 1, parse: [IRR('a', 'ə')],               introAfter: { gpcs: ['a', 't'] }, say: 'A cat sat on a mat.' },
  { w: 'he',   level: 1, parse: ['h', IRR('e', 'iː')],         introAfter: { gpcs: ['h', 'e'] }, say: 'He is hot.' },
  { w: 'go',   level: 5, parse: ['g', IRR('o', 'oʊ')],         introAfter: { gpcs: ['g', 'o'] }, say: 'Go, go, go!', note: '⚠️ o = /oʊ/ (US) or /əʊ/ (UK)' },
  { w: 'of',   level: 5, parse: [IRR('o', 'ʌ'), IRR('f', 'v')], introAfter: { gpcs: ['o', 'f'] }, say: 'A cup of milk.' },
  { w: 'she',  level: 6, parse: ['sh', IRR('e', 'iː')],        introAfter: { gpcs: ['sh', 'e'] }, say: 'She is my friend.' },
  { w: 'you',  level: 6, parse: ['y', IRR('ou', 'uː')],        introAfter: { gpcs: ['y'] }, say: 'I like you.' },
  { w: 'we',   level: 7, parse: ['w', IRR('e', 'iː')],         introAfter: { gpcs: ['w', 'e'] }, say: 'We can run.' },
  { w: 'was',  level: 7, parse: ['w', IRR('a', 'ɒ'), 's_z'],   introAfter: { gpcs: ['w', 'a', 's_z'] }, say: 'It was fun.', note: '⚠️ a = /ɒ/ (UK) or /ʌ/ (US)' },
];
for (const s of STAR_WORDS) s.tricky = s.parse.filter(p => p.irregular).map(p => p.g).join('+');
export const MAX_NEW_STAR_PER_LEVEL = 2;

// Decodable sentences (design/words-board 4): every token is a star word or a word from WORDS (any level), so the
// untaught-sound check applies word by word. Full stops throughout; no negation in picture-checked sentences (v2 V7).
// Scored check (v2 V7): `scene` names two content words of the sentence and their pictures (shown together); each
// `alts` entry swaps exactly ONE of them, so every distractor differs from the sentence by one word and one noun alone
// never gives the answer away. Distractor words are spoken / pictured only, never printed (untaught sounds are fine).
const S = (id, text, scene, alts) => ({ id, text, scene, alts });
export const SENTENCES = [
  S('man-mat', 'the man sat on the mat.', { man: '👨', mat: '#mat' }, { man: ['cat', '#cat'], mat: ['pan', '🍳'] }),
  S('map-mat', 'the map is on the mat.', { map: '🗺️', mat: '#mat' }, { map: ['pin', '📌'], mat: ['pan', '🍳'] }),
  S('pin-pot', 'the pin is in the pot.', { pin: '📌', pot: '🍲' }, { pin: ['map', '🗺️'], pot: ['pan', '🍳'] }),
  S('pot-map', 'a pot is on a map.', { pot: '🍲', map: '🗺️' }, { pot: ['pan', '🍳'], map: ['mat', '#mat'] }),
  // sets 3–8 (each served only once all its sounds are known and its star words were met)
  S('dog-mat', 'the dog sat on the mat.', { dog: '🐶', mat: '#mat' }, { dog: ['pig', '🐷'], mat: ['bed', '🛏️'] }),
  S('fan-pot', 'the fan is on the pot.', { fan: '🪭', pot: '🍲' }, { fan: ['pin', '📌'], pot: ['pan', '🍳'] }),
  S('cat-pan', 'the cat is in the pan.', { cat: '#cat', pan: '🍳' }, { cat: ['dog', '🐶'], pan: ['pot', '🍲'] }),
  S('nut-can', 'a nut is in the can.', { nut: '🥜', can: '🥫' }, { nut: ['pin', '📌'], can: ['pot', '🍲'] }),
  S('hen-bed', 'the hen is on the bed.', { hen: '🐔', bed: '🛏️' }, { hen: ['dog', '🐶'], bed: ['mat', '#mat'] }),
  S('bug-hat', 'the bug is on the hat.', { bug: '🐛', hat: '#hat' }, { bug: ['ant', '🐜'], hat: ['cap', '🧢'] }),
  S('rat-hat', 'a rat is in the hat.', { rat: '🐀', hat: '#hat' }, { rat: ['bat', '🦇'], hat: ['cap', '🧢'] }),
  S('cat-bus', 'the cat is on the bus.', { cat: '#cat', bus: '🚌' }, { cat: ['dog', '🐶'], bus: ['van', '🚐'] }),
  S('dog-log', 'the dog ran to the log.', { dog: '🐶', log: '🪵' }, { dog: ['pig', '🐷'], log: ['bed', '🛏️'] }),
  S('sock-bed', 'the sock is on the bed.', { sock: '🧦', bed: '🛏️' }, { sock: ['hat', '#hat'], bed: ['mat', '#mat'] }),
  S('doll-bed', 'the doll is in the bed.', { doll: '🪆', bed: '🛏️' }, { doll: ['duck', '🦆'], bed: ['pot', '🍲'] }),
  S('duck-hat', 'the duck has a hat.', { duck: '🦆', hat: '#hat' }, { duck: ['hen', '🐔'], hat: ['sock', '🧦'] }),
  S('fox-box', 'the fox is in the box.', { fox: '🦊', box: '📦' }, { fox: ['cat', '#cat'], box: ['bed', '🛏️'] }),
  S('bug-web', 'a bug is in the web.', { bug: '🐛', web: '🕸️' }, { bug: ['bee', '🐝'], web: ['box', '📦'] }),
  S('dog-van', 'the dog is in the van.', { dog: '🐶', van: '🚐' }, { dog: ['pig', '🐷'], van: ['bus', '🚌'] }),
  S('frog-log', 'the frog is on the log.', { frog: '🐸', log: '🪵' }, { frog: ['duck', '🦆'], log: ['bed', '🛏️'] }),
  S('frog-drum', 'the frog sat on the drum.', { frog: '🐸', drum: '🥁' }, { frog: ['cat', '#cat'], drum: ['box', '📦'] }),
  S('crab-pot', 'the crab is in the pot.', { crab: '🦀', pot: '🍲' }, { crab: ['fish', '🐟'], pot: ['pan', '🍳'] }),
  S('dog-truck', 'the dog is in the truck.', { dog: '🐶', truck: '🚚' }, { dog: ['pig', '🐷'], truck: ['bus', '🚌'] }),
  S('cat-tent', 'the cat is in the tent.', { cat: '#cat', tent: '⛺' }, { cat: ['dog', '🐶'], tent: ['van', '🚐'] }),
  S('gift-box', 'the gift is in the box.', { gift: '🎁', box: '📦' }, { gift: ['sock', '🧦'], box: ['bed', '🛏️'] }),
  S('cat-dog', 'the cat and the dog sat.', { cat: '#cat', dog: '🐶' }, { cat: ['pig', '🐷'], dog: ['hen', '🐔'] }),
  S('fish-bath', 'the fish is in the bath.', { fish: '🐟', bath: '🛁' }, { fish: ['duck', '🦆'], bath: ['pot', '🍲'] }),
  S('chick-nest', 'the chick is in the nest.', { chick: '🐤', nest: '🪺' }, { chick: ['frog', '🐸'], nest: ['hat', '#hat'] }),
  S('ring-box', 'the ring is in the box.', { ring: '💍', box: '📦' }, { ring: ['bell', '🔔'], box: ['pot', '🍲'] }),
  S('duck-ship', 'the duck is on the ship.', { duck: '🦆', ship: '🚢' }, { duck: ['dog', '🐶'], ship: ['bus', '🚌'] }),
];
// scene picture: the content pictures joined with '+' (rendered side by side); distractors swap one of them
export const scenePic = scene => Object.values(scene).join('+');
for (const s of SENTENCES) s.pic = scenePic(s.scene);

// Tiny decodable stories (v2 V9): 3–5 pages, one decodable sentence each (star words tapped, the rest blended), each
// page's picture revealed after it is read (the last one only after the question). One character, one problem, one
// turn, past tense. Titles are printed, so they decode too. `after`: the map stop the story follows (stories start at
// the first new-words stops, about stop 19, not only at the end). The ask's 3 answers come from the story itself.
export const STORIES = [
  { id: 'pot', after: 'words:set4', cover: '🍲', title: 'the cat and the pot', pages: [
    { text: 'a cat sat on a mat.', pic: '#cat+#mat' }, { text: 'a pot is on the mat.', pic: '🍲+#mat' },
    { text: 'the cat can tip it!', pic: '#cat+🍲' }, { text: 'the pot is not on the mat.', pic: '#mat' }, { text: 'the cat is sad.', pic: '#cat' }],
    ask: { text: 'What did the cat tip?', answer: '🍲', others: ['#mat', '#cat'] } },
  { id: 'hat', after: 'words:set6', cover: '🎩', title: 'the red hat', pages: [
    { text: 'the dog had a big red hat.', pic: '🐶+#hat' }, { text: 'the hat fell off!', pic: '#hat' },
    { text: 'it fell in the mud.', pic: '#hat+🟤' }, { text: 'the dog got the hat back.', pic: '🐶+#hat' }, { text: 'the dog got a big hug.', pic: '🐶+🤗' }],
    ask: { text: 'What fell in the mud?', answer: '#hat', others: ['🐶', '🧦'] } },
  { id: 'fox', after: 'words:set7', cover: '🦊', title: 'the fox and the box', pages: [
    { text: 'the fox got in the box.', pic: '🦊+📦' }, { text: 'the cat sat on the box!', pic: '#cat+📦' },
    { text: 'bump! the box fell.', pic: '📦' }, { text: 'the fox ran.', pic: '🦊' }],
    ask: { text: 'Who ran?', answer: '🦊', others: ['#cat', '📦'] } },
  { id: 'king', cover: '👑', title: 'the king got wet', pages: [
    { text: 'the king had a big ship.', pic: '👑+🚢' }, { text: 'bump! the ship hit a rock.', pic: '🚢+🪨' },
    { text: 'the king fell in!', pic: '👑+🌊' }, { text: 'a fish got the king back.', pic: '🐟+👑' }],
    ask: { text: 'Who fell in?', answer: '👑', others: ['🐟', '🚢'] } },
  { id: 'lunch', cover: '🧺', title: 'lunch on the bench', pages: [
    { text: 'I sit on the bench.', pic: '🪑' }, { text: 'lunch is in the bag.', pic: '🧺' },
    { text: 'the duck got the bun!', pic: '🦆' }, { text: 'no, duck, no!', pic: '😮' }],
    ask: { text: 'Who got the bun?', answer: '🦆', others: ['🧒', '🐶'] } },
];
STORIES.forEach(s => s.pages.forEach((p, i) => (p.id = `${s.id}-${i + 1}`)));

// Mascot lines. Two takes of "Let's slide it again": calm (default) and upbeat; neither sounds disappointed.
export const MASCOT = {
  'm-hello': "Hi! I'm Kit. Let's read together!",
  'm-slide-intro': 'Slide your finger under the word.',
  'm-tap-hint': 'Tap a letter to hear its name. Tap a dot to hear its sound!',
  'm-tap-hint-sound': 'Tap a letter or a dot to hear its sound!',
  'm-which-picture': 'Which picture is…',
  'm-which-word': 'Which word did you read?',
  'm-which-pic': 'Which picture?',
  'm-say-sounds': 'Say the sounds, then pick.', // v2 V2 S2: silent dots
  'm-read-it': 'Read it!', // v2 V2 S1: no slider
  'm-slide-again-calm': "Let's slide it again.",
  'm-slide-again-upbeat': "Ooh, so close! Let's slide it again!",
  'm-you-read-it': 'You read it!',
  'm-slide-slowly': "Let's slide slowly, so we hear every sound.",
  'm-next-word': 'Ready for the next word?',
  'm-all-done': 'All done for today. Great reading!',
  'm-demo-rule': 'Now letters say their names, and dots say their sounds!',
  'm-find-letter': 'Can you find…',
  'm-hunt-sound': 'Find the letter that says…',
  'm-tap-names': 'Tap a letter to hear its name!',
  'm-tap-sounds': 'Tap a letter to hear its sound!',
  'm-letter-says': 'This letter says…',
  'm-tap-it': 'Tap it!',
  'm-two-letters': 'Two letters, one sound!',
  'm-family-pick': 'Pick a letter and put it in front of',
  'm-family-done': 'You made the whole family!',
  'm-family-more': 'Make another one!',
  'm-trace-start': 'Start at the green dot and follow the arrows!',
  'm-back-on': 'Back on the dots!',
  'm-find-sound': 'Find…',
  'm-read-together': "Let's read it together!",
  'm-star-word': 'This is a star word. We just know it!',
  'm-star-tap': 'Star word! Tap it.',
  'm-read-all': 'Now read it all!',
  'm-which-shows': 'Which picture shows it?',
  'm-read-again': "Let's read it again.",
  'm-new-letter': 'Here is a new letter!',
  'm-yes': 'Yes!',
  'm-find-word': 'Can you find the word…',
  'm-tricky-part': 'This part is tricky. We learn it by heart.',
  'm-level-up': 'You did it!',
  'm-review': "Let's warm up with some sounds you know.",
  'm-thats': "That's…",
};

export const SFX = {
  'sfx-chime': { text: 'soft warm chime (success, under 1 s)', file: 'placeholder/sfx-chime.wav' },
  'sfx-tap': { text: 'soft tap tick', file: 'placeholder/sfx-tap.wav' },
};

export const SESSION_WORDS = 5; // pebbles in the top bar
