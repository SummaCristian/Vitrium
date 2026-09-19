import { Spring, onSpringFrame } from '../../src/index.js';
import { createPlayground } from '../components/playground.js';
import { h, section } from '../dom.js';
import { button } from './util.js';

const DOT = 44;

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

x.to(240, { stiffness: ${s.stiffness}, damping: ${s.damping} });`,
    });

    const press = h('div', { class: 'row' },
      h('button', { class: 'lg-btn pill lg-glass liquid-glass', type: 'button' }, 'Press me'),
      h('div', { class: 'lg-glass lg-glass--clear liquid-glass', style: 'padding: 1rem 1.4rem; border-radius: 24px' }, 'Drag me'));

    return [
      section('Overview', {},
        h('p', {}, 'Motion in the library comes from two places: CSS transitions driven by a handful of easing and duration tokens, and a small spring engine for anything that follows a finger.'),
        h('p', {}, 'The rule of thumb is that pressing is quick and linear, and letting go is a spring with a little overshoot.')),
      section('Springs', {},
        h('p', {}, 'Spring is a value that chases a target. to() sets the target with a stiffness, damping and mass; higher stiffness pulls harder, and lower damping lets it overshoot and wobble. Every spring on the page shares one animation loop, and onSpringFrame() runs your render callback on each frame while anything is moving.'),
        spring),
      section('Press and stretch', {},
        h('p', {}, 'Any element with the liquid-glass class shrinks slightly when pressed. Hold and drag and it stretches toward the pointer with an elastic falloff, then springs back on release. A drag past 8px counts as a gesture, so the click on release is swallowed and the control does not fire.'),
        h('p', {}, 'It writes to the translate and scale properties rather than transform, so it stacks on top of any transform the element already has.'),
        h('div', { class: 'card' }, press)),
      section('Reduced motion', {},
        h('p', {}, 'With prefers-reduced-motion on, springs jump straight to their target, the overshoot easing becomes a plain ease and the spring-back is shortened to 0.15s. Press feedback stays, since it tells you the control responded.')),
    ];
  },
};
