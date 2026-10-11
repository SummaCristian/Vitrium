import { createToggle, createSegmentedControl, createButton, createSlider, createStepper, createTextField, createProgress } from '../../src/index.js';
import { h, section, codeBlock } from '../dom.js';
import { demoIcons, navIcons } from '../icons.js';

const REPO = 'SummaCristian/Vitrium';
const STARS_KEY = 'lgw:stars';

// The repository's star count, from GitHub's API, kept for an hour so moving around the site doesn't spend the
// unauthenticated rate limit. null when it can't be had: the button then just says GitHub, as it does at zero.
async function starCount() {
  try {
    const kept = JSON.parse(sessionStorage.getItem(STARS_KEY));
    if (kept && Date.now() - kept.at < 3600e3) return kept.n;
  } catch { /* nothing kept */ }
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const n = (await res.json()).stargazers_count;
    if (typeof n !== 'number') return null;
    try { sessionStorage.setItem(STARS_KEY, JSON.stringify({ n, at: Date.now() })); } catch { /* not kept: fine */ }
    return n;
  } catch { return null; }
}
const compact = (n) => (n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '')}k`);

function githubButton() {
  const count = h('span', { class: 'gh-count' });
  const star = h('span', { class: 'gh-star' });
  star.innerHTML = demoIcons.star.svg;
  const icon = h('span', { class: 'gh-icon' });
  icon.innerHTML = navIcons.github;
  const btn = h('a', { class: 'lg-btn pill lg-glass lg-glass--clear liquid-glass gh-btn', href: `https://github.com/${REPO}`, target: '_blank', rel: 'noopener' },
    icon, h('span', {}, 'GitHub'), h('span', { class: 'gh-stars', 'aria-hidden': 'true' }, h('span', { class: 'gh-stars-in' }, star, count)));
  starCount().then((n) => {
    if (!n || !btn.isConnected) return;   // none yet: a plain GitHub button reads better than a zero
    count.textContent = compact(n);
    btn.setAttribute('aria-label', `GitHub, ${n} star${n === 1 ? '' : 's'}`);
    // The pill grows to make room (a grid column going 0fr to 1fr, in CSS) as the count grows in.
    requestAnimationFrame(() => btn.classList.add('gh-btn--stars'));
  });
  return btn;
}

// Real components, scattered around the logo. Each sits in a float: placed, tilted and given a depth in CSS
// (.float--<name>), it drifts slowly and leans with the pointer, the deeper ones more.
function scatter() {
  const seg = h('div');
  createSegmentedControl(seg, {
    items: ['Day', 'Week', 'Month'].map((v) => ({ value: v.toLowerCase(), label: v })), value: 'week', selectedColor: 'accent',
  });
  const ring = createProgress({ variant: 'circular', value: 0.68, size: 44, label: 'Progress' });
  const stepper = createStepper({ value: 2, min: 0, max: 10, label: 'Guests', labels: ['Remove a guest', 'Add a guest'], onChange: (v) => ring.set(Math.min(1, v / 3)) });
  const items = {
    seg,
    ring: ring.el,
    star: createButton({ icon: demoIcons.star.svg, label: 'Favourite', tint: '#ff375f' }),
    toggle: createToggle({ value: true, label: 'Notifications' }).el,
    stepper: stepper.el,
    slider: createSlider({ value: 60, label: 'Volume' }).el,
    search: createTextField({ variant: 'search', label: 'Search', placeholder: 'Search' }).el,
    plus: createButton({ icon: demoIcons.plus.svg, label: 'Add', glass: 'clear' }),
  };
  return Object.entries(items).map(([name, node]) => h('div', { class: `float float--${name}` }, h('div', { class: 'float-in' }, node)));
}

export const home = {
  render(root) {
    const stage = h('div', { class: 'hero-stage' },
      h('h1', { class: 'hero-mark' }, h('img', { src: './logo.png', alt: 'Vitrium', width: 1200, height: 538 })), ...scatter());

    // The pointer leans the scatter (--px, --py: -1 to 1 across the stage). Mouse only: a finger isn't hovering anywhere.
    const onMove = (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = stage.getBoundingClientRect();
      stage.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
      stage.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
    };
    const onLeave = () => { stage.style.removeProperty('--px'); stage.style.removeProperty('--py'); };
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerleave', onLeave);
    // The drift repaints the glass every frame, so it stops while the hero is off screen.
    const io = new IntersectionObserver(([entry]) => stage.classList.toggle('paused', !entry.isIntersecting));
    io.observe(stage);

    root.append(
      h('header', { class: 'home-hero' },
        stage,
        h('p', { class: 'lede hero-lede' }, 'Liquid Glass, for the web. A vanilla JS/CSS design system with real glass, springy physics and morphing surfaces. No framework, and this whole site is built from it.'),
        h('div', { class: 'row hero-actions' },
          h('a', { class: 'lg-btn pill lg-glass lg-glass--tinted liquid-glass', href: '#/start' }, 'Get started'),   // tinted: the accent, by default
          h('a', { class: 'lg-btn pill lg-glass lg-glass--clear liquid-glass', href: '#/components' }, 'Browse components'),
          githubButton())),

      section('Built with Vitrium', {},
        h('div', { class: 'card lg-glass showcase' },
          h('div', { class: 'showcase-text' },
            h('div', { class: 'showcase-app' },
              h('img', { src: './showcase/poliaule-icon.webp', alt: '', width: 56, height: 56 }),
              h('div', {}, h('h3', {}, 'PoliAule'), h('span', { class: 'muted' }, 'poliaule.com'))),
            h('p', {}, 'Find a free classroom at Politecnico di Milano, in seconds. Its pickers, sheets, popovers, alerts and toggles, and the sliding lens of its tab bar, are all Vitrium, used daily by students on their phones.'),
            h('div', { class: 'row' },
              h('a', { class: 'lg-btn pill lg-glass lg-glass--tinted liquid-glass', href: 'https://poliaule.com', target: '_blank', rel: 'noopener' }, 'Open PoliAule'),
              h('a', { class: 'lg-btn pill lg-glass lg-glass--clear liquid-glass', href: 'https://github.com/SummaCristian/poliaule', target: '_blank', rel: 'noopener' }, 'Source'))),
          h('div', { class: 'showcase-shots', 'aria-hidden': 'true' },
            ['details', 'available', 'campus'].map((s) => h('img', { src: `./showcase/poliaule-${s}.webp`, alt: '', width: 490, height: 1000, loading: 'lazy', decoding: 'async' }))))),

      section('What is inside', {},
        h('div', { class: 'grid' },
          h('a', { class: 'card lg-glass card-link', href: '#/foundation' }, h('h3', {}, 'Foundation'), h('p', {}, 'The glass material, the tokens, theming, blur, motion and the core building blocks.')),
          h('a', { class: 'card lg-glass card-link', href: '#/components' }, h('h3', {}, 'Components'), h('p', {}, 'Sixteen controls, pickers, overlays and bars, each with a playground and its API.')),
          h('a', { class: 'card lg-glass card-link', href: '#/start' }, h('h3', {}, 'Guides'), h('p', {}, 'Frameworks, server rendering, browser support, accessibility and theming.')))),

      section('Start building', {},
        h('p', {}, 'One package and one stylesheet. Every component is a function that builds real DOM.'),
        codeBlock(`
npm install vitrium

import 'vitrium/styles';
import { initLiquidGlass, initBlurCapability, createToggle } from 'vitrium';

initLiquidGlass();
initBlurCapability();
document.body.append(createToggle({ value: true, label: 'Notifications' }).el);`)),
    );

    return () => io.disconnect();
  },
};
