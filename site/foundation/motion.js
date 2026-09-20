import { Spring, onSpringFrame, createSegmentedControl } from '../../src/index.js';
import { createPlayground } from '../components/playground.js';
import { h, section, table, codeBlock } from '../dom.js';
import { button, html } from './util.js';

const DOT = 44;

// --- The easing tokens, read live from the page (so reduced motion shows up in them) ---

// [duration token, easing token] for the three motions the CSS tokens drive.
const CURVES = {
  'Press out': ['--lg-press-out-dur', '--lg-ease-spring'],
  'Morph': ['--lg-morph-dur', '--lg-ease-morph'],
  'Press in': ['--lg-press-in-dur', '--lg-press-in-ease'],
};
const KEYWORDS = { linear: [0, 0, 1, 1], ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1] };
const token = (name) => getComputedStyle(html).getPropertyValue(name).trim();
const seconds = (v) => (v.endsWith('ms') ? parseFloat(v) / 1000 : parseFloat(v));
const bezierOf = (v) => {
  const m = v.match(/cubic-bezier\(([^)]+)\)/);
  return m ? m[1].split(',').map(Number) : KEYWORDS[v] ?? KEYWORDS.ease;
};

// The curve of a cubic-bezier easing: time across, progress up, with the target (1) dashed. Where it rises above
// the dashed line it is overshooting. `marker` is the vertical line a Play sweeps across at the real duration.
function curveSvg([x1, y1, x2, y2]) {
  const at = (t) => {
    const u = 1 - t;
    return [3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3, 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3];
  };
  const pts = Array.from({ length: 81 }, (_, i) => at(i / 80));
  const top = Math.max(1, ...pts.map((p) => p[1]));
  const bottom = Math.min(0, ...pts.map((p) => p[1]));
  const X = (x) => 16 + x * 168;
  const Y = (y) => 124 - ((y - bottom) / (top - bottom)) * 108;
  const path = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join('');
  const over = top > 1.005 ? `<text x="184" y="${Y(top) - 4}" text-anchor="end" class="curve-note">+${Math.round((top - 1) * 100)}% overshoot</text>` : '';
  const wrap = h('div', { class: 'curve' });
  wrap.innerHTML = `<svg viewBox="0 0 200 140" role="img" aria-label="Easing curve">
    <line x1="16" x2="184" y1="${Y(0)}" y2="${Y(0)}" class="curve-axis"/>
    <line x1="16" x2="184" y1="${Y(1)}" y2="${Y(1)}" class="curve-axis curve-axis--target"/>
    <text x="12" y="${Y(1) + 3}" text-anchor="end" class="curve-note">1</text>
    <text x="12" y="${Y(0) + 3}" text-anchor="end" class="curve-note">0</text>
    <path d="${path}" class="curve-line"/>
    <line x1="16" x2="16" y1="8" y2="132" class="curve-marker"/>${over}</svg>`;
  return wrap;
}

function easingPlayer() {
  const dot = h('div', { class: 'spring-dot lg-glass lg-glass--circle' });
  const track = h('div', { class: 'spring-track' }, dot);
  const curveHost = h('div');
  const values = h('p', { class: 'curve-values' });
  let name = 'Press out';
  let atEnd = false;

  const show = () => {
    const [dur, ease] = CURVES[name];
    curveHost.replaceChildren(curveSvg(bezierOf(token(ease))));
    values.replaceChildren(h('code', {}, ease), ' over ', h('code', {}, dur), ` = ${token(ease)}, ${token(dur)}`);
  };
  const play = () => {
    const [dur, ease] = CURVES[name];
    atEnd = !atEnd;
    // The real tokens, not copies: under reduced motion the curve and the dot both change.
    dot.style.transition = `translate var(${dur}) var(${ease})`;
    dot.style.translate = `${atEnd ? track.clientWidth - DOT : 0}px 0`;
    curveHost.querySelector('.curve-marker')?.animate(
      [{ translate: '0 0' }, { translate: '168px 0' }], { duration: seconds(token(dur)) * 1000, easing: 'linear' });
  };

  const seg = h('div');
  createSegmentedControl(seg, {
    items: Object.keys(CURVES).map((v) => ({ value: v, label: v })), value: name, selectedColor: 'accent',
    onSelect(v, { silent }) { if (silent) return; name = v; show(); },
  });
  show();
  return h('div', { class: 'card lg-glass easing' },
    h('div', { class: 'row' }, seg, button('Play', play)),
    h('div', { class: 'easing-body' }, curveHost, h('div', { class: 'easing-side' }, track, values)));
}

// --- How far a dragged surface follows the pointer (the same formula as core/liquid-glass.js) ---

function falloffSvg() {
  const give = (d) => 16 * Math.log1p(d / 16) * 0.7;
  const MAX_D = 300, MAX_Y = 40;
  const X = (d) => 20 + (d / MAX_D) * 170;
  const Y = (y) => 124 - (y / MAX_Y) * 108;
  const curve = Array.from({ length: 61 }, (_, i) => { const d = (i / 60) * MAX_D; return `${i ? 'L' : 'M'}${X(d).toFixed(1)} ${Y(give(d)).toFixed(1)}`; }).join('');
  const wrap = h('div', { class: 'curve curve--wide' });
  wrap.innerHTML = `<svg viewBox="0 0 200 140" role="img" aria-label="How far the surface moves as the pointer is dragged further">
    <line x1="20" x2="190" y1="124" y2="124" class="curve-axis"/>
    <line x1="20" x2="${X(MAX_Y)}" y1="124" y2="${Y(MAX_Y)}" class="curve-axis curve-axis--target"/>
    <path d="${curve}" class="curve-line"/>
    <text x="${X(MAX_Y) + 4}" y="${Y(MAX_Y) + 8}" class="curve-note">1:1</text>
    <text x="190" y="${Y(give(MAX_D)) - 5}" text-anchor="end" class="curve-note">${give(MAX_D).toFixed(0)}px at ${MAX_D}px</text>
    <text x="190" y="136" text-anchor="end" class="curve-note">pointer distance</text>
    <text x="20" y="10" class="curve-note">surface travel</text></svg>`;
  return wrap;
}

export default {
  id: 'motion',
  title: 'Motion',
  abstract: 'Springs, press physics and how reduced motion is handled.',
  sections() {
    const spring = createPlayground({
      options: [
        { key: 'stiffness', label: 'Stiffness', type: 'choice', choices: [100, 300, 600], default: 300 },
        { key: 'damping', label: 'Damping', type: 'choice', choices: [8, 20, 40], default: 20 },
      ],
      render(s, stage) {
        const dot = h('div', { class: 'spring-dot lg-glass lg-glass--circle' });
        const track = h('div', { class: 'spring-track' }, dot);
        const x = new Spring(0);
        let atEnd = false;
        const off = onSpringFrame(() => {
          // The playground rebuilds this stage on every change; drop the spring once it's gone.
          if (!dot.isConnected) { off(); x.dispose(); return; }
          dot.style.translate = `${x.value}px 0`;
        });
        stage.append(track, button('Move', () => {
          atEnd = !atEnd;
          x.to(atEnd ? track.clientWidth - DOT : 0, { stiffness: s.stiffness, damping: s.damping });
        }));
      },
      code: (s) => `import { Spring, onSpringFrame } from 'liquid-glass-web';

const x = new Spring(0);
onSpringFrame(() => { dot.style.translate = \`\${x.value}px 0\`; });

// damping ratio ${(s.damping / (2 * Math.sqrt(s.stiffness))).toFixed(2)}: ${s.damping >= 2 * Math.sqrt(s.stiffness) ? 'no overshoot' : 'overshoots'}
x.to(240, { stiffness: ${s.stiffness}, damping: ${s.damping} });`,
    });

    const press = h('div', { class: 'row' },
      h('button', { class: 'lg-btn pill lg-glass liquid-glass', type: 'button' }, 'Press me'),
      h('div', { class: 'lg-glass lg-glass--clear liquid-glass', style: 'padding: 1rem 1.4rem; border-radius: 24px' }, 'Drag me'));

    return [
      section('Overview', {},
        h('p', {}, 'Motion in the library comes from three places, each for a different job:'),
        table(['Mechanism', 'Used for', 'Lives in'], [
          ['CSS transitions on easing and duration tokens', 'Anything that goes from A to B on its own: press-out, morphs, hover.', '`tokens.css`'],
          ['The `Spring` engine', 'Anything that follows a finger: sliding pills, drags, sheets.', '`core/spring.js`'],
          ['Press and stretch', 'Any glass surface you can press, and drag to deform.', '`core/liquid-glass.js`'],
        ]),
        h('p', {}, 'The rule of thumb is that pressing is quick and linear, and letting go is a spring with a little overshoot.')),

      section('Easing tokens', {},
        h('p', {}, 'Three pairs of tokens, each a duration with an easing. Play each one to see the curve and the same motion side by side. The line sweeps across the curve at the real duration, and the dashed line is the target: where the curve rises above it, the motion is overshooting.'),
        easingPlayer(),
        table(['Token', 'Default', 'Used for'], [
          ['`--lg-press-in-dur` `--lg-press-in-ease`', '0.11s, fast, no overshoot', 'Snapping down when pressed. Fast and without overshoot, so it feels immediate.'],
          ['`--lg-press-out-dur` `--lg-ease-spring`', '0.5s, overshoot', 'Springing back on release. The overshoot is what makes it feel elastic.'],
          ['`--lg-morph-dur` `--lg-ease-morph`', '0.45s, small overshoot', 'A control changing size or shape. The overshoot is smaller so a large surface does not wobble.'],
        ]),
        h('p', {}, 'All of them can be overridden like any other token. See Tokens.')),

      section('Springs', {},
        h('p', {}, 'CSS easing is fixed once it starts. A spring is a value that chases a target, so it can be redirected at any moment and keeps its momentum, which is what a drag needs. `Spring` is that value: `to()` sets the target with a stiffness, damping and mass, and `value` is where it is now.'),
        h('p', {}, 'Stiffness pulls harder toward the target. Damping removes energy. How they balance is the damping ratio, `damping / (2 × √(stiffness × mass))`: below 1 the spring overshoots and wobbles, at 1 it arrives as fast as it can without overshooting, above 1 it is slower and calmer. The code below prints it for the current options.'),
        spring,
        h('p', {}, 'Under the hood every spring shares one animation loop, which sleeps when nothing is moving. Each frame is stepped in slices of at most 4ms, so a stiff spring stays stable, and a long frame (a background tab coming back) is capped at 64ms so nothing jumps. A spring counts as arrived once it is within 0.05 of its target and moving slower than that. `onSpringFrame()` runs your render callback on each frame while anything is moving.'),
        table(['Option', 'Default', 'Meaning'], [
          ['`stiffness`', '300', 'How hard it is pulled toward the target.'],
          ['`damping`', '30', 'How quickly it loses speed.'],
          ['`mass`', '1', 'Heavier is slower to start and slower to stop.'],
        ])),

      section('Press and stretch', {},
        h('p', {}, 'Any element with the `liquid-glass` class shrinks slightly when pressed. Hold and drag and it stretches toward the pointer with an elastic falloff, then springs back on release. A drag past 8px counts as a gesture, so the click on release is swallowed and the control does not fire.'),
        h('p', {}, 'It writes to the `translate` and `scale` properties rather than `transform`, so it stacks on top of any `transform` the element already has.'),
        h('div', { class: 'card lg-glass' }, press),
        h('h3', { class: 'sub-label' }, 'How it decides'),
        table(['Stage', 'What happens'], [
          ['Hover', 'Grows to 1.045, on devices that can hover.'],
          ['Press', 'Snaps down to 0.94 with the press-in easing.'],
          ['Drag', 'After 8px of travel it tracks the pointer with no transition. The surface moves 70% of an elastic "give" and stretches along the drag while squashing across it, capped at 16%.'],
          ['Release', 'The inline values are cleared, so the CSS transition springs it home with the press-out easing. It stays on top of its neighbours until it has landed.'],
        ]),
        h('p', {}, 'The give is logarithmic, `16 × ln(1 + distance / 16)`. It follows the pointer at first, then tires, so a surface can be pulled but never runs away from its place:'),
        falloffSvg()),

      section('Reduced motion', {},
        h('p', {}, 'With `prefers-reduced-motion` on, movement is cut down and feedback is kept, since feedback tells you the control responded.'),
        table(['What', 'Normal', 'Reduced'], [
          ['Springs', 'Move to the target over time.', 'Jump straight to the target.'],
          ['Press out easing', 'Overshoots.', 'A plain `ease`.'],
          ['Press out duration', '0.5s', '0.15s'],
          ['Press in', 'Snaps down.', 'Snaps down. Kept.'],
          ['Drag', 'Stretches and squashes.', 'Stays pressed, but does not stretch.'],
        ]),
        h('p', {}, 'This page reads the easing tokens live, so with the setting on, the Easing tokens player above shows the plain curves.'),
        codeBlock(`
@media (prefers-reduced-motion: reduce) {
  :root {
    --lg-ease-spring: ease;
    --lg-press-in-ease: ease;
    --lg-press-out-dur: 0.15s;
  }
}`, 'text')),
    ];
  },
};
