// 2026-04-09: Initial sprite, face, and bubble rendering from the public buddy forensics reference.
// sprites.js - ASCII sprite frames, hats, compact faces, blink rendering, and speech bubbles.

import { wrap } from './util.js';

const BODIES = {
  duck: [
    ['', '    __      ', '  <({E} )___ ', '   (  ._>   ', "    `--'    "],
    ['', '    __      ', '  <({E} )___ ', '   (  ._>   ', "    `--'~   "],
    ['', '    __      ', '  <({E} )___ ', '   (  .__>  ', "    `--'    "],
  ],
  goose: [
    ['', '     ({E}>   ', '     ||     ', '   _(__)_   ', '    ^^^^    '],
    ['', '     ({E}>   ', '     ||     ', '   _(__)_   ', '    ^^^^    '],
    ['', '     ({E}>>  ', '     ||     ', '   _(__)_   ', '    ^^^^    '],
  ],
  blob: [
    ['', '   .----.   ', '  ( {E}  {E} ) ', '  (      )  ', "   `----'   "],
    ['', '  .------.  ', ' (  {E}  {E}  )', ' (        ) ', '  `------`  '],
    ['', '    .--.    ', '   ({E}  {E})  ', '   (    )   ', '    `--`    '],
  ],
  cat: [
    ['', '   /\\_/\\\\   ', '  ( {E}   {E}) ', '  (  \u03c9  )  ', '  (")_(")  '],
    ['', '   /\\_/\\\\   ', '  ( {E}   {E}) ', '  (  \u03c9  )  ', '  (")_(")~ '],
    ['', '   /\\-/\\\\   ', '  ( {E}   {E}) ', '  (  \u03c9  )  ', '  (")_(")  '],
  ],
  dragon: [
    ['', '  /^\\  /^\\  ', ' <  {E}  {E}  > ', ' (   ~~   ) ', "  `-vvvv-'  "],
    ['', '  /^\\  /^\\  ', ' <  {E}  {E}  > ', ' (        ) ', "  `-vvvv-'  "],
    ['~    ~      ', '  /^\\  /^\\  ', ' <  {E}  {E}  > ', ' (   ~~   ) ', "  `-vvvv-'  "],
  ],
  octopus: [
    ['', '   .----.   ', '  ( {E}  {E} ) ', '  (______)  ', '  /\\/\\/\\/\\  '],
    ['', '   .----.   ', '  ( {E}  {E} ) ', '  (______)  ', '  \\/\\/\\/\\/  '],
    ['      o     ', '   .----.   ', '  ( {E}  {E} ) ', '  (______)  ', '  /\\/\\/\\/\\  '],
  ],
  owl: [
    ['', '   /\\  /\\   ', '  (({E})({E}))', '  (  ><  )  ', "   `----'   "],
    ['', '   /\\  /\\   ', '  (({E})({E}))', '  (  ><  )  ', '   .----.   '],
    ['', '   /\\  /\\   ', '  (({E})(-)) ', '  (  ><  )  ', "   `----'   "],
  ],
  penguin: [
    ['', '  .---.     ', '  ({E}>{E})    ', ' /(   )\\    ', "  `---'     "],
    ['', '  .---.     ', '  ({E}>{E})    ', ' |(   )|    ', "  `---'     "],
    [' .---.      ', '({E}>{E})      ', '/(   )\\     ', " `---'      ", ' ~ ~        '],
  ],
  turtle: [
    ['', '   _,--._   ', '  ( {E}  {E} ) ', ' /[______]\\ ', '  ``    ``  '],
    ['', '   _,--._   ', '  ( {E}  {E} ) ', ' /[______]\\ ', '  ``  ``    '],
    ['', '   _,--._   ', '  ( {E}  {E} ) ', ' /[======]\\ ', '  ``    ``  '],
  ],
  snail: [
    ['', ' {E}    .--. ', '  \\  ( @ ) ', '   \\_`--\'  ', '  ~~~~~~~   '],
    ['', ' {E}   .--.  ', '  |  ( @ ) ', '   \\_`--\'  ', '  ~~~~~~~   '],
    ['', ' {E}    .--. ', '  \\  ( @  )', '   \\_`--\'  ', '  ~~~~~~    '],
  ],
  ghost: [
    ['', '   .----.   ', '  / {E}  {E} \\ ', '  |      |  ', '  ~`~``~`~  '],
    ['', '   .----.   ', '  / {E}  {E} \\ ', '  |      |  ', '  `~`~~`~`  '],
    ['~  ~        ', '   .----.   ', '  / {E}  {E} \\ ', '  |      |  ', '  ~~`~~`~~  '],
  ],
  axolotl: [
    ['', '}~(______)~{', '}~({E} .. {E})~{', '  ( .--. )  ', '  (_/  \\_)  '],
    ['', '~}(______){~', '~}({E} .. {E}){~', '  ( .--. )  ', '  (_/  \\_)  '],
    ['', '}~(______)~{', '}~({E} .. {E})~{', '  (  --  )  ', '  ~_/  \\_~  '],
  ],
  capybara: [
    ['', '  n______n  ', ' ( {E}    {E} )', ' (   oo   ) ', "  `------'  "],
    ['', '  n______n  ', ' ( {E}    {E} )', ' (   Oo   ) ', "  `------'  "],
    ['~  ~        ', '  u______n  ', ' ( {E}    {E} )', ' (   oo   ) ', "  `------'  "],
  ],
  cactus: [
    ['', ' n  ____  n ', ' | |{E}  {E}| |', ' |_|    |_| ', '   |    |   '],
    ['', '    ____    ', ' n |{E}  {E}| n', ' |_|    |_| ', '   |    |   '],
    ['n        n  ', ' |  ____  | ', ' | |{E}  {E}| |', ' |_|    |_| ', '   |    |   '],
  ],
  robot: [
    ['', '   .[||].   ', '  [ {E}  {E} ] ', '  [ ==== ]  ', "  `------'  "],
    ['', '   .[||].   ', '  [ {E}  {E} ] ', '  [ -==- ]  ', "  `------'  "],
    ['      *     ', '   .[||].   ', '  [ {E}  {E} ] ', '  [ ==== ]  ', "  `------'  "],
  ],
  rabbit: [
    ['', '   (\\__/)   ', '  ( {E}  {E} ) ', ' =(  ..  )= ', '  (")__(")  '],
    ['', '   (|__/)   ', '  ( {E}  {E} ) ', ' =(  ..  )= ', '  (")__(")  '],
    ['', '   (\\__/)   ', '  ( {E}  {E} ) ', ' =( .  . )= ', '  (")__(")  '],
  ],
  mushroom: [
    ['', ' .-o-OO-o-. ', '(__________)', '   |{E}  {E}|   ', '   |____|   '],
    ['', ' .-O-oo-O-. ', '(__________)', '   |{E}  {E}|   ', '   |____|   '],
    [' . o  .     ', ' .-o-OO-o-. ', '(__________)', '   |{E}  {E}|   ', '   |____|   '],
  ],
  chonk: [
    ['', '  /\\    /\\  ', ' ( {E}    {E} )', ' (   ..   ) ', "  `------'  "],
    ['', '  /\\    /|  ', ' ( {E}    {E} )', ' (   ..   ) ', "  `------'  "],
    ['', '  /\\    /\\  ', ' ( {E}    {E} )', ' (   ..   ) ', "  `------'~ "],
  ],
};

const HAT_LINES = {
  none: '',
  crown: '   \\^^^/    ',
  tophat: '   [___]    ',
  propeller: '    -+-     ',
  halo: '   (   )    ',
  wizard: '    /^\\     ',
  beanie: '   (___)    ',
  tinyduck: '    ,>      ',
};

const FACE_TEMPLATES = {
  duck: (eye) => `(${eye}>`,
  goose: (eye) => `(${eye}>`,
  blob: (eye) => `(${eye}${eye})`,
  cat: (eye) => `=${eye}\u03c9${eye}=`,
  dragon: (eye) => `<${eye}~${eye}>`,
  octopus: (eye) => `~(${eye}${eye})~`,
  owl: (eye) => `(${eye})(${eye})`,
  penguin: (eye) => `(${eye}>)`,
  turtle: (eye) => `[${eye}_${eye}]`,
  snail: (eye) => `${eye}(@)`,
  ghost: (eye) => `/${eye}${eye}\\`,
  axolotl: (eye) => `}${eye}.${eye}{`,
  capybara: (eye) => `(${eye}oo${eye})`,
  cactus: (eye) => `|${eye}  ${eye}|`,
  robot: (eye) => `[${eye}${eye}]`,
  rabbit: (eye) => `(${eye}..${eye})`,
  mushroom: (eye) => `|${eye}  ${eye}|`,
  chonk: (eye) => `(${eye}.${eye})`,
};

function getFrames(species) {
  return BODIES[species] || BODIES.duck;
}

export function renderSprite(bones, frameIndex = 0) {
  const frames = getFrames(bones?.species);
  const frame = frames[((frameIndex % frames.length) + frames.length) % frames.length];
  const lines = frame.map((line) => line.replaceAll('{E}', bones?.eye || '@'));

  if (bones?.hat && bones.hat !== 'none' && !lines[0].trim()) {
    lines[0] = HAT_LINES[bones.hat] || '';
  }

  if (!lines[0].trim() && frames.every((candidate) => !candidate[0].trim())) {
    lines.shift();
  }

  return lines;
}

export function renderFace(bones) {
  const template = FACE_TEMPLATES[bones?.species] || FACE_TEMPLATES.duck;
  return template(bones?.eye || '@');
}

export function spriteFrameCount(species) {
  return getFrames(species).length;
}

export function renderBlink(bones) {
  return renderSprite(bones, 0).map((line) => line.split(bones?.eye || '@').join('-'));
}

export function renderBubble(text) {
  if (!text) {
    return [];
  }

  // 2026-04-09: Cap at 6 content lines (~180 chars) per plan P2 fix #9.
  const lines = wrap(text, 30).slice(0, 6);
  const width = 32;
  const output = [];
  output.push(`\u256d${'\u2500'.repeat(width)}\u256e`);
  for (const line of lines) {
    output.push(`\u2502 ${line.padEnd(30)} \u2502`);
  }
  output.push(`\u2570${'\u2500'.repeat(width)}\u256f`);
  return output;
}
