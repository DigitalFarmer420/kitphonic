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
// sound is never tied to one picture. Placeholder emoji art; the word is shown with its letter in coral.
export const LETTER_PICS = {
  m: [['moon', '🌙'], ['mouse', '🐭'], ['map', '🗺️']], s: [['sun', '☀️'], ['sock', '🧦'], ['seal', '🦭']],
  a: [['apple', '🍎'], ['ant', '🐜'], ['alligator', '🐊']], t: [['tiger', '🐯'], ['tent', '⛺'], ['teddy', '🧸']],
  p: [['pig', '🐷'], ['penguin', '🐧'], ['pan', '🍳']], i: [['insect', '🐞'], ['ink', '🖋️']],
  n: [['nest', '🪺'], ['nose', '👃'], ['net', '🥅']], o: [['octopus', '🐙'], ['ox', '🐂'], ['otter', '🦦']],
  d: [['dog', '🐶'], ['duck', '🦆']], f: [['fish', '🐟'], ['fox', '🦊']], c: [['cat', '🐈'], ['cup', '☕']],
  k: [['kite', '🪁'], ['key', '🔑']], e: [['egg', '🥚'], ['elephant', '🐘']], u: [['umbrella', '☂️'], ['up', '⬆️']],
  g: [['goat', '🐐'], ['gift', '🎁']], r: [['rabbit', '🐇'], ['rocket', '🚀']], h: [['hat', '🎩'], ['horse', '🐴']],
  b: [['bus', '🚌'], ['bed', '🛏️']], l: [['lion', '🦁'], ['leaf', '🍃']], j: [['jellyfish', '🪼'], ['jet', '✈️']],
  v: [['van', '🚐'], ['violin', '🎻']], w: [['web', '🕸️'], ['worm', '🪱']], x: [['fox', '🦊'], ['box', '📦']],
  y: [['yo-yo', '🪀'], ['yak', '🐃']], z: [['zebra', '🦓'], ['zip', '🤐']], qu: [['queen', '👸']],
  sh: [['ship', '🚢'], ['sheep', '🐑']], ch: [['chick', '🐤'], ['cheese', '🧀']], th: [['thumb', '👍']],
  ng: [['ring', '💍'], ['king', '🤴']], ck: [['duck', '🦆'], ['sock', '🧦']], ll: [['bell', '🔔'], ['doll', '🪆']],
  ss: [['dress', '👗']], s_z: [['nose', '👃'], ['rose', '🌹']], th_v: [['feather', '🪶']], ff: [['cliff', '🏔️']], zz: [['buzz', '🐝']], nk: [['sink', '🚰']],
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
    W('mat', 'm a t', { pic: '#mat' }), W('map', 'm a p', { pic: '🗺️' }), W('tap', 't a p', { pic: '🚰' }),
    W('pan', 'p a n', { pic: '🍳' }), W('man', 'm a n', { pic: '👨' }), W('pin', 'p i n', { pic: '📌' }),
    W('sat', 's a t', { say: 'Sat! The cat sat.' }), W('nap', 'n a p', { say: 'Nap! Time for a nap.' }),
    W('sip', 's i p', { say: 'Sip! Take a sip.' }), W('tin', 't i n', { say: 'Tin! A tin can.' }),
  ],
  3: [ // CVC, all phonemes. map/pan re-read sound-by-sound (spec L3 examples)
    W('pot', 'p o t', { pic: '🍲' }), W('mop', 'm o p', { pic: '🧹' }), W('map', 'm a p', { pic: '🗺️' }), W('pan', 'p a n', { pic: '🍳' }),
    W('sit', 's i t', { say: 'Sit! Sit down.' }), W('pop', 'p o p', { say: 'Pop! Pop the bubble.' }),
    W('top', 't o p', { say: 'Top! Spin the top.' }), W('tip', 't i p', { say: 'Tip! The tip of my nose.' }),
    W('not', 'n o t', { say: 'Not! Not now.' }), W('pit', 'p i t', { say: 'Pit! A big pit.' }),
    // set 3: o d f
    W('dog', 'd o g', { pic: '🐶', say: 'Dog! A happy dog.' }), W('dot', 'd o t', { pic: '⚫', say: 'Dot! A little dot.' }), W('fan', 'f a n', { pic: '🪭', say: 'Fan! A cool fan.' }),
    W('fin', 'f i n', { pic: '🦈', say: 'Fin! A shark fin.' }), W('dip', 'd i p', { say: 'Dip! Dip your toes.' }), W('nod', 'n o d', { say: 'Nod! Nod your head.' }),
    W('sad', 's a d', { say: 'Sad! Not sad today.' }), W('dad', 'd a d', { say: 'Dad! Hi, Dad!' }), W('fit', 'f i t', { say: 'Fit! It fits.' }), W('pod', 'p o d', { say: 'Pod! A pea pod.' }),
    // set 4: c k e u
    W('cat', 'c a t', { pic: '#cat', say: 'Cat! The cat sat.' }), W('cap', 'c a p', { pic: '🧢', say: 'Cap! A red cap.' }), W('cup', 'c u p', { pic: '☕', say: 'Cup! A cup of milk.' }),
    W('pen', 'p e n', { pic: '🖊️', say: 'Pen! Write with a pen.' }), W('net', 'n e t', { pic: '🥅', say: 'Net! In the net.' }), W('nut', 'n u t', { pic: '🥜', say: 'Nut! A crunchy nut.' }),
    W('sun', 's u n', { pic: '☀️', say: 'Sun! The hot sun.' }), W('can', 'c a n', { pic: '🥫', say: 'Can! A tin can.' }), W('kid', 'k i d', { say: 'Kid! A happy kid.' }),
    W('kit', 'k i t', { say: 'Kit! That is me!' }), W('ten', 't e n', { say: 'Ten! Count to ten.' }), W('pet', 'p e t', { say: 'Pet! A pet cat.' }), W('cut', 'c u t', { say: 'Cut! Cut the paper.' }),
    W('mud', 'm u d', { say: 'Mud! Muddy boots.' }), W('fun', 'f u n', { say: 'Fun! That was fun.' }), W('den', 'd e n', { say: 'Den! A fox den.' }),
    // set 5: g r h b l
    W('bag', 'b a g', { pic: '👜', say: 'Bag! A big bag.' }), W('bed', 'b e d', { pic: '🛏️', say: 'Bed! Time for bed.' }), W('bus', 'b u s', { pic: '🚌', say: 'Bus! Get on the bus.' }),
    W('bat', 'b a t', { pic: '🦇', say: 'Bat! A bat can fly.' }), W('bin', 'b i n', { pic: '🗑️', say: 'Bin! In the bin.' }), W('bug', 'b u g', { pic: '🐛', say: 'Bug! A little bug.' }),
    W('hat', 'h a t', { pic: '#hat', say: 'Hat! A big hat.' }), W('hen', 'h e n', { pic: '🐔', say: 'Hen! The hen sat.' }), W('leg', 'l e g', { pic: '🦵', say: 'Leg! Hop on one leg.' }),
    W('log', 'l o g', { pic: '🪵', say: 'Log! A big log.' }), W('rat', 'r a t', { pic: '🐀', say: 'Rat! A rat ran.' }), W('pig', 'p i g', { pic: '🐷', say: 'Pig! A pink pig.' }),
    W('tag', 't a g', { pic: '🏷️', say: 'Tag! A name tag.' }), W('big', 'b i g', { say: 'Big! So big!' }), W('hop', 'h o p', { say: 'Hop! Hop like a frog.' }),
    W('hot', 'h o t', { say: 'Hot! It is hot.' }), W('hug', 'h u g', { say: 'Hug! A big hug.' }), W('red', 'r e d', { say: 'Red! A red ball.' }), W('run', 'r u n', { say: 'Run! Run fast.' }),
    W('lid', 'l i d', { say: 'Lid! Put the lid on.' }), W('got', 'g o t', { say: 'Got! I got it.' }), W('dig', 'd i g', { say: 'Dig! Dig a hole.' }), W('ran', 'r a n', { say: 'Ran! The dog ran.' }),
    W('rug', 'r u g', { say: 'Rug! A soft rug.' }), W('gum', 'g u m', { say: 'Gum! Chewing gum.' }), W('lot', 'l o t', { say: 'Lot! A lot of fun.' }),
    // set 6: ck ff ll ss, s = /z/
    W('duck', 'd u ck', { pic: '🦆', say: 'Duck! Quack, quack.' }), W('sock', 's o ck', { pic: '🧦', say: 'Sock! A warm sock.' }), W('lock', 'l o ck', { pic: '🔒', say: 'Lock! Lock the door.' }),
    W('bell', 'b e ll', { pic: '🔔', say: 'Bell! Ring the bell.' }), W('doll', 'd o ll', { pic: '🪆', say: 'Doll! A little doll.' }), W('hill', 'h i ll', { pic: '⛰️', say: 'Hill! Up the hill.' }),
    W('kick', 'k i ck', { say: 'Kick! Kick the ball.' }), W('back', 'b a ck', { say: 'Back! Come back.' }), W('neck', 'n e ck', { say: 'Neck! A long neck.' }), W('sick', 's i ck', { say: 'Sick! Not sick now.' }),
    W('tell', 't e ll', { say: 'Tell! Tell me.' }), W('fell', 'f e ll', { say: 'Fell! It fell down.' }), W('kiss', 'k i ss', { say: 'Kiss! A goodnight kiss.' }), W('mess', 'm e ss', { say: 'Mess! What a mess.' }),
    W('puff', 'p u ff', { say: 'Puff! Puff of smoke.' }), W('his', 'h i s_z', { say: 'His! His hat.' }), W('has', 'h a s_z', { say: 'Has! She has a cat.' }),
    // set 7: j v w x y z zz qu
    W('jam', 'j a m', { pic: '🍯', say: 'Jam! Jam on toast.' }), W('jet', 'j e t', { pic: '✈️', say: 'Jet! A fast jet.' }), W('van', 'v a n', { pic: '🚐', say: 'Van! A big van.' }),
    W('web', 'w e b', { pic: '🕸️', say: 'Web! A spider web.' }), W('box', 'b o x', { pic: '📦', say: 'Box! In the box.' }), W('fox', 'f o x', { pic: '🦊', say: 'Fox! A red fox.' }),
    W('zip', 'z i p', { pic: '🤐', say: 'Zip! Zip it up.' }), W('buzz', 'b u zz', { pic: '🐝', say: 'Buzz! Buzz, buzz, bee.' }), W('wig', 'w i g', { say: 'Wig! A funny wig.' }),
    W('wet', 'w e t', { say: 'Wet! Wet socks.' }), W('win', 'w i n', { say: 'Win! We win!' }), W('six', 's i x', { say: 'Six! Six legs.' }), W('mix', 'm i x', { say: 'Mix! Mix it up.' }),
    W('yes', 'y e s', { say: 'Yes! Yes, please.' }), W('yum', 'y u m', { say: 'Yum! Yum, yum.' }), W('vet', 'v e t', { say: 'Vet! The vet helps pets.' }), W('jog', 'j o g', { say: 'Jog! Jog to the park.' }),
    W('fizz', 'f i zz', { say: 'Fizz! Fizzy drink.' }), W('quiz', 'qu i z', { say: 'Quiz! A fun quiz.' }), W('quit', 'qu i t', { say: 'Quit! Never quit.' }),
  ],
  6: [ // digraph sh (sequence set 8; L5 = CVCC final blends is reserved): one joined sky tile, one slider stop per SOUND (ship = 3 stops)
    W('ship', 'sh i p', { pic: '🚢', say: 'Ship! A big ship.' }), W('shop', 'sh o p', { pic: '🏪', say: 'Shop! A little shop.' }),
    W('fish', 'f i sh', { pic: '🐟', say: 'Fish! A fish can swim.' }), W('dish', 'd i sh', { pic: '🍽️', say: 'Dish! A dish for dinner.' }),
    W('cash', 'c a sh', { say: 'Cash! Money to spend.' }), W('shed', 'sh e d', { pic: '🛖', say: 'Shed! A garden shed.' }),
    W('shut', 'sh u t', { say: 'Shut! Shut the door.' }), W('shot', 'sh o t', { say: 'Shot! What a good shot.' }),
    W('shell', 'sh e ll', { pic: '🐚', say: 'Shell! A sea shell.' }), W('rush', 'r u sh', { say: 'Rush! No need to rush.' }),
    // ch
    W('chip', 'ch i p', { say: 'Chip! A crunchy chip.' }), W('chop', 'ch o p', { say: 'Chop! Chop the wood.' }), W('chin', 'ch i n', { say: 'Chin! Touch your chin.' }),
    W('chick', 'ch i ck', { pic: '🐤', say: 'Chick! A fluffy chick.' }), W('much', 'm u ch', { say: 'Much! Thank you so much.' }), W('rich', 'r i ch', { say: 'Rich! Rich chocolate.' }),
    W('lunch', 'l u n ch', { pic: '🥪', say: 'Lunch! Time for lunch.' }), W('chest', 'ch e s t', { say: 'Chest! A treasure chest.' }), W('bench', 'b e n ch', { say: 'Bench! Sit on the bench.' }),
    // th (thin) and th (that)
    W('thin', 'th i n', { say: 'Thin! A thin stick.' }), W('bath', 'b a th', { pic: '🛁', say: 'Bath! Bath time.' }), W('moth', 'm o th', { say: 'Moth! A moth at night.' }),
    W('path', 'p a th', { say: 'Path! Walk on the path.' }), W('thick', 'th i ck', { say: 'Thick! A thick book.' }),
    W('that', 'th_v a t', { say: 'That! Look at that.' }), W('this', 'th_v i s', { say: 'This! I like this.' }), W('them', 'th_v e m', { say: 'Them! Give it to them.' }), W('then', 'th_v e n', { say: 'Then! And then?' }),
    // ng, nk
    W('ring', 'r i ng', { pic: '💍', say: 'Ring! A gold ring.' }), W('king', 'k i ng', { pic: '🤴', say: 'King! The king sat.' }), W('wing', 'w i ng', { say: 'Wing! A bird wing.' }),
    W('song', 's o ng', { say: 'Song! Sing a song.' }), W('long', 'l o ng', { say: 'Long! A long snake.' }), W('sing', 's i ng', { say: 'Sing! Sing with me.' }), W('thing', 'th i ng', { say: 'Thing! A funny thing.' }),
    W('sink', 's i nk', { say: 'Sink! Wash in the sink.' }), W('pink', 'p i nk', { say: 'Pink! A pink pig.' }), W('bank', 'b a nk', { pic: '🏦', say: 'Bank! Money in the bank.' }),
    W('tank', 't a nk', { say: 'Tank! A fish tank.' }), W('wink', 'w i nk', { say: 'Wink! Wink at me.' }), W('think', 'th i nk', { say: 'Think! Let me think.' }),
  ],
  4: [ // CCVC: starting blend; each blend consonant its own dot
    W('stop', 's t o p', { pic: '🛑', say: 'Stop!' }), W('spot', 's p o t', { pic: '🔴', say: 'A red spot!' }), // no minimal-pair pictures yet: reveal without check
    W('snap', 's n a p', { say: 'Snap! Snap your fingers.' }), W('spin', 's p i n', { say: 'Spin! Spin around.' }),
    W('snip', 's n i p', { say: 'Snip! Snip the paper.' }), W('spit', 's p i t', { say: 'Spit! Spit it out.' }),
    W('spat', 's p a t', { say: 'Spat! The cat spat.' }),
    // later sets
    W('step', 's t e p', { say: 'Step! One more step.' }), W('skip', 's k i p', { say: 'Skip! Skip along.' }), W('flag', 'f l a g', { pic: '🚩', say: 'Flag! A red flag.' }),
    W('frog', 'f r o g', { pic: '🐸', say: 'Frog! A green frog.' }), W('drum', 'd r u m', { pic: '🥁', say: 'Drum! Bang the drum.' }), W('crab', 'c r a b', { pic: '🦀', say: 'Crab! A red crab.' }),
    W('plug', 'p l u g', { pic: '🔌', say: 'Plug! Plug it in.' }), W('clap', 'c l a p', { pic: '👏', say: 'Clap! Clap your hands.' }), W('grin', 'g r i n', { say: 'Grin! A big grin.' }),
    W('trip', 't r i p', { say: 'Trip! A fun trip.' }), W('drop', 'd r o p', { say: 'Drop! Do not drop it.' }), W('flip', 'f l i p', { say: 'Flip! Flip it over.' }),
    W('glad', 'g l a d', { say: 'Glad! I am glad.' }), W('plan', 'p l a n', { say: 'Plan! A good plan.' }), W('slip', 's l i p', { say: 'Slip! Do not slip.' }),
    W('clock', 'c l o ck', { pic: '⏰', say: 'Clock! Tick tock, clock.' }), W('dress', 'd r e ss', { pic: '👗', say: 'Dress! A party dress.' }), W('truck', 't r u ck', { pic: '🚚', say: 'Truck! A big truck.' }),
    W('smell', 's m e ll', { say: 'Smell! Smell the flower.' }), W('swim', 's w i m', { say: 'Swim! Swim like a fish.' }), W('twin', 't w i n', { say: 'Twin! My twin.' }),
  ],
  5: [ // CVCC: final blend; each consonant its own dot (sand = 4 stops)
    W('sand', 's a n d', { say: 'Sand! Sand at the beach.' }), W('pond', 'p o n d', { say: 'Pond! Ducks on the pond.' }), W('mist', 'm i s t', { say: 'Mist! Morning mist.' }),
    W('past', 'p a s t', { say: 'Past! Run past it.' }), W('fast', 'f a s t', { say: 'Fast! So fast!' }), W('soft', 's o f t', { say: 'Soft! A soft pillow.' }),
    W('damp', 'd a m p', { say: 'Damp! Damp socks.' }), W('mint', 'm i n t', { say: 'Mint! A mint leaf.' }),
    W('hand', 'h a n d', { pic: '✋', say: 'Hand! Wave your hand.' }), W('tent', 't e n t', { pic: '⛺', say: 'Tent! A tent for camping.' }), W('milk', 'm i l k', { pic: '🥛', say: 'Milk! A glass of milk.' }),
    W('nest', 'n e s t', { pic: '🪺', say: 'Nest! A bird nest.' }), W('lamp', 'l a m p', { pic: '💡', say: 'Lamp! Turn on the lamp.' }), W('gift', 'g i f t', { pic: '🎁', say: 'Gift! A gift for you.' }),
    W('vest', 'v e s t', { pic: '🦺', say: 'Vest! A bright vest.' }), W('desk', 'd e s k', { say: 'Desk! Sit at the desk.' }), W('dust', 'd u s t', { say: 'Dust! Dust on the shelf.' }),
    W('help', 'h e l p', { say: 'Help! Can I help?' }), W('jump', 'j u m p', { say: 'Jump! Jump up high.' }), W('just', 'j u s t', { say: 'Just! Just one more.' }),
    W('land', 'l a n d', { say: 'Land! Land the plane.' }), W('last', 'l a s t', { say: 'Last! The last one.' }), W('left', 'l e f t', { say: 'Left! Turn left.' }),
    W('lift', 'l i f t', { say: 'Lift! Lift it up.' }), W('lost', 'l o s t', { say: 'Lost! I lost my sock.' }), W('melt', 'm e l t', { say: 'Melt! The snow will melt.' }),
    W('must', 'm u s t', { say: 'Must! We must go.' }), W('rest', 'r e s t', { say: 'Rest! Time to rest.' }), W('went', 'w e n t', { say: 'Went! We went home.' }),
    W('best', 'b e s t', { say: 'Best! You are the best.' }), W('band', 'b a n d', { say: 'Band! A band plays music.' }), W('hunt', 'h u n t', { say: 'Hunt! A treasure hunt.' }),
    W('next', 'n e x t', { say: 'Next! What is next?' }), W('camp', 'c a m p', { say: 'Camp! We camp in a tent.' }), W('belt', 'b e l t', { say: 'Belt! A brown belt.' }),
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
  { text: 'rat', pic: '🐀', ph: 'r a t' }, { text: 'mitt', pic: '🧤', ph: 'm i t' }, { text: 'cap', pic: '🧢', ph: 'c a p' },
  { text: 'fan', pic: '🪭', ph: 'f a n' }, { text: 'van', pic: '🚐', ph: 'v a n' }, { text: 'pen', pic: '🖊️', ph: 'p e n' },
  { text: 'fin', pic: '🦈', ph: 'f i n' }, { text: 'bin', pic: '🗑️', ph: 'b i n' }, { text: 'pig', pic: '🐷', ph: 'p i g' },
  { text: 'tag', pic: '🏷️', ph: 't a g' }, { text: 'dot', pic: '⚫', ph: 'd o t' },
  { text: 'chip', pic: '🍟', ph: 'ch i p' }, { text: 'chop', pic: '🪓', ph: 'ch o p' },
];
for (const p of PICTURE_POOL) p.phonemes = p.ph.split(' ').map(id => GPC[id].phoneme);

// Star (tricky) words — literacy review R6 (⚠️ list still an open user decision; spec §3.6 had was/said/of/to/you).
// parse: GPC ids for regular parts; { g, ph, irregular: true } marks the "tricky part" (heart grapheme).
// introAfter: GPC ids that must be taught first, plus optional prerequisite star word.
const IRR = (g, ph) => ({ g, ph, irregular: true });
export const STAR_WORDS = [
  { w: 'I',    level: 2, parse: [IRR('I', 'aɪ')],              introAfter: { gpcs: ['i'] }, say: 'I can see Kit.', capital: true },
  { w: 'the',  level: 2, parse: [IRR('th', 'ð'), IRR('e', 'ə')], introAfter: { gpcs: ['m', 's', 'a', 't'] }, say: 'The cat sat on the mat.' }, // at blending unlock
  { w: 'is',   level: 3, parse: ['i', IRR('s', 'z')],          introAfter: { gpcs: ['s', 'i'] }, say: 'It is a map.' },
  { w: 'to',   level: 3, parse: ['t', IRR('o', 'uː')],         introAfter: { gpcs: ['t', 'o'] }, say: 'Go to the top.' },
  { w: 'no',   level: 4, parse: ['n', IRR('o', 'oʊ')],         introAfter: { gpcs: ['n', 'o'] }, say: 'No, not now.', note: '⚠️ o = /oʊ/ (US) or /əʊ/ (UK)' },
  { w: 'into', level: 4, parse: ['i', 'n', 't', IRR('o', 'uː')], introAfter: { gpcs: ['i', 'n', 't', 'o'], star: 'to' }, say: 'Pop it into the pot.' },
];
for (const s of STAR_WORDS) s.tricky = s.parse.filter(p => p.irregular).map(p => p.g).join('+');
export const MAX_NEW_STAR_PER_LEVEL = 2;

// Decodable sentences (design/words-board 4): every token is a star word or a word from WORDS (any level), so the
// untaught-sound check applies word by word. pic: revealed after "read it all".
export const SENTENCES = [
  { id: 'man-sat', text: 'the man sat', pic: '👨' },
  { id: 'sat-mat', text: 'I sat on the mat', pic: '#mat' },
  { id: 'tap-pan', text: 'tap the pan', pic: '🍳' },
  { id: 'map-mat', text: 'the map is on the mat', pic: '🗺️' },
  { id: 'pin-tin', text: 'the pin is in the tin', pic: '📌' },
  { id: 'mop-pot', text: 'the mop is in the pot', pic: '🧹' },
  { id: 'not-pot', text: 'no, not the pot', pic: '🍲' },
  { id: 'pop-pot', text: 'pop it into the pot', pic: '🍲' },
  { id: 'stop-top', text: 'stop at the top', pic: '🛑' },
];

// Mascot lines. Two takes of "Let's slide it again": calm (default) and upbeat; neither sounds disappointed.
export const MASCOT = {
  'm-hello': "Hi! I'm Kit. Let's read together!",
  'm-slide-intro': 'Slide your finger under the word.',
  'm-tap-hint': 'Tap a letter to hear its name. Tap a dot to hear its sound!',
  'm-tap-hint-sound': 'Tap a letter or a dot to hear its sound!',
  'm-which-picture': 'Which picture is…',
  'm-which-word': 'Which word did you read?',
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
