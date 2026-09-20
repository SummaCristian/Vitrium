import {
  getBlurMode, setBlurMode, applyBlurState, resolveBlurCapability, reevaluateBlurCapability,
  runBlurBenchmark, getCachedBlurVerdict, BLUR_BENCHMARK, createSegmentedControl,
} from '../../src/index.js';
import { h, section, table, codeBlock } from '../dom.js';
import { themeTokens, blurOffTokens } from './tokens.js';

const html = document.documentElement;
const { SAMPLE_MS, WARMUP_FRAMES, JANK_THRESHOLD_MS, MAX_JANK_RATIO, BENCHMARK_CACHE_KEY } = BLUR_BENCHMARK;
const CHART_MAX_MS = 60;   // the chart's full height; a longer frame just fills the bar
const pct = (n) => `${Math.round(n * 100)}%`;

// One preview, forced on or off in a fixed theme, regardless of the page's blur state, benchmark result or theme.
// Like the Theme page, the panel carries its own tokens (the real ones from tokens.css) because [data-blur] and
// [data-theme] only switch on <html>. The page's off rule is !important, so each glass sets its backdrop-filter
// inline with !important to outrank it.
function blurPreview(theme, off) {
  const tokens = new Map([...themeTokens(theme), ...(off ? blurOffTokens(theme) : [])]);
  const glass = (clear) => {
    const filter = off ? 'none' : clear ? 'blur(var(--lg-blur-clear)) saturate(var(--lg-tint-saturate-clear))' : 'blur(var(--lg-blur-md))';
    return h('div', {
      class: `lg-glass blur-preview-glass${clear ? ' lg-glass--clear' : ''}`,
      style: `-webkit-backdrop-filter: ${filter} !important; backdrop-filter: ${filter} !important`,
    }, clear ? 'Clear' : 'Regular');
  };
  return h('div', { class: 'blur-preview', style: [...tokens].map(([k, v]) => `${k}: ${v}`).join(';') },
    h('div', { class: 'blur-preview-behind', 'aria-hidden': 'true' }, 'Behind the glass'),
    h('span', { class: 'blur-preview-label' }, `${theme === 'dark' ? 'Dark' : 'Light'} · ${off ? 'Blur off' : 'Blur on'}`),
    h('div', { class: 'blur-preview-row' }, glass(false), glass(true)));
}

// The live benchmark. It runs the library's own runBlurBenchmark(), so the pass/fail is the real verdict,
// and draws every frame it reports: one bar per frame, height = how long the frame took.
function benchmarkRunner() {
  const bars = h('div', { class: 'bench-bars' });
  const line = h('div', { class: 'bench-line', style: `bottom: ${(JANK_THRESHOLD_MS / CHART_MAX_MS) * 100}%` }, h('span', {}, `${JANK_THRESHOLD_MS} ms`));
  const chart = h('div', { class: 'bench-chart', role: 'img', 'aria-label': 'Frame times of the benchmark run' }, line, bars,
    h('p', { class: 'bench-empty' }, 'Run the benchmark to see each frame.'));
  const verdict = h('div', { class: 'bench-verdict', 'aria-live': 'polite' });
  const stat = (label) => { const v = h('strong', {}, '-'); return [v, h('div', { class: 'bench-stat' }, h('span', {}, label), v)]; };
  const [frames, framesEl] = stat('Frames');
  const [sampled, sampledEl] = stat('Counted');
  const [dropped, droppedEl] = stat('Dropped');
  const [ratio, ratioEl] = stat(`Dropped share (limit ${pct(MAX_JANK_RATIO)})`);
  const [avg, avgEl] = stat('Average frame');
  const status = h('div', { class: 'bench-status' });

  const refreshStatus = () => {
    const cached = getCachedBlurVerdict();
    status.replaceChildren(
      h('span', {}, 'Mode ', h('strong', {}, getBlurMode())),
      h('span', {}, 'Cached verdict ', h('strong', {}, cached === null ? 'none' : cached ? 'blur on' : 'blur off')),
      h('span', {}, 'Page ', h('strong', {}, `data-blur="${html.dataset.blur ?? 'unset'}"`)));
  };
  refreshStatus();

  const run = h('button', { class: 'lg-btn pill lg-glass liquid-glass', type: 'button' }, 'Run benchmark');
  run.addEventListener('click', async () => {
    run.disabled = true;
    run.textContent = 'Running…';
    bars.replaceChildren();
    chart.classList.add('has-data');
    verdict.className = 'bench-verdict';
    verdict.textContent = '';
    let n = 0, counted = 0, jank = 0, sum = 0;
    const capable = await runBlurBenchmark({
      onFrame({ gap, warmup, jank: isJank }) {
        n++;
        if (!warmup) { counted++; sum += gap; if (isJank) jank++; }
        bars.append(h('span', {
          class: warmup ? 'bar bar--warmup' : isJank ? 'bar bar--jank' : 'bar',
          style: `height: ${Math.min(gap / CHART_MAX_MS, 1) * 100}%`,
          title: `${gap.toFixed(1)} ms${warmup ? ' (warm-up, not counted)' : ''}`,
        }));
        frames.textContent = n;
        sampled.textContent = counted;
        dropped.textContent = jank;
        ratio.textContent = counted ? pct(jank / counted) : '-';
        avg.textContent = counted ? `${(sum / counted).toFixed(1)} ms` : '-';
      },
    });
    run.disabled = false;
    run.textContent = 'Run again';
    if (n === 0) {
      verdict.className = 'bench-verdict fail';
      verdict.textContent = 'Fail: this browser does not support backdrop-filter, so blur stays off.';
    } else {
      verdict.className = `bench-verdict ${capable ? 'pass' : 'fail'}`;
      verdict.textContent = capable
        ? 'Pass: this device keeps up, so blur would be switched on.'
        : counted <= 1 ? 'Fail: too few frames to judge (was the tab in the background?), so blur stays off.'
          : 'Fail: too many dropped frames, so blur would stay off.';
    }
    refreshStatus();
  });

  return h('div', { class: 'card lg-glass bench' },
    h('div', { class: 'row' }, run, h('span', { class: 'bench-hint' }, `About ${SAMPLE_MS / 1000}s. This only measures; it does not change the page or the cached verdict.`)),
    chart,
    h('div', { class: 'bench-legend' },
      h('span', {}, h('i', { class: 'swatch-dot swatch-dot--warmup' }), `Warm-up (first ${WARMUP_FRAMES}, ignored)`),
      h('span', {}, h('i', { class: 'swatch-dot swatch-dot--ok' }), 'Counted'),
      h('span', {}, h('i', { class: 'swatch-dot swatch-dot--jank' }), `Dropped (over ${JANK_THRESHOLD_MS} ms)`)),
    h('div', { class: 'bench-stats' }, framesEl, sampledEl, droppedEl, ratioEl, avgEl),
    verdict,
    h('h3', { class: 'sub-label' }, 'Right now'), status);
}

export default {
  id: 'blur',
  title: 'Blur',
  abstract: 'Backdrop blur is benchmarked and can be forced on or off.',
  sections() {
    // The override. Switching to Auto with no cached verdict runs the benchmark straight away (otherwise it
    // would stay off until the next visit).
    const host = h('div');
    createSegmentedControl(host, {
      items: ['auto', 'on', 'off'].map((v) => ({ value: v, label: v })), value: getBlurMode(), selectedColor: 'accent',
      onSelect(v, { silent }) {
        if (silent) return;
        setBlurMode(v);
        applyBlurState(resolveBlurCapability());
        if (v === 'auto' && getCachedBlurVerdict() === null) reevaluateBlurCapability();
      },
    });

    return [
      section('Overview', {},
        h('p', {}, '`backdrop-filter` is the most expensive part of the glass: the browser has to re-blur whatever is behind an element on every frame. Fine on most devices, but on a weak GPU it makes scrolling and dragging stutter.'),
        h('p', {}, 'So the library never assumes blur. It starts with blur off, benchmarks the device once the page is idle, and only switches blur on if the device keeps up. The verdict is cached, and the user can override it.')),

      section('How it works', {},
        h('p', {}, '`initBlurCapability()` does two things. It applies a verdict immediately, so the first paint is right, then it schedules the benchmark for later. The verdict is the first of these that applies:'),
        table(['Order', 'Source', 'Result'], [
          ['1', 'Mode is `on` or `off`', 'That, and nothing else is checked.'],
          ['2', '`prefers-reduced-transparency: reduce`', 'Off.'],
          ['3', 'A cached benchmark result', 'Whatever the benchmark decided last time.'],
          ['4', 'Nothing yet', 'Off. This is the safe default on a first visit.'],
        ]),
        h('p', {}, 'The verdict is written to `<html data-blur="on|off">` and announced with a `lg:blurstatechange` event, for anything (such as a shadow-DOM component) that cannot read the page\'s custom properties.')),

      section('What "off" changes', {},
        h('p', {}, 'Off is not just "no blur". Without a blur to soften what is behind it, a translucent tint would be hard to read, so the tokens change too: every `--lg-blur-*` becomes `0px`, the tint becomes near-opaque, and a catch-all rule removes any other `backdrop-filter` under `<html>`, including ones in your own CSS.'),
        h('div', { class: 'blur-previews' }, blurPreview('light', false), blurPreview('light', true), blurPreview('dark', false), blurPreview('dark', true))),

      section('The benchmark', {},
        h('p', {}, 'The question it answers is narrow: can this device composite a full-screen backdrop blur without dropping frames? It answers it by measuring how steady the browser\'s frame rate stays while a blurred panel is on screen.'),
        h('ol', { class: 'steps' },
          h('li', {}, h('strong', {}, 'Wait for idle. '), 'It never runs during load, where layout, fonts and JIT warm-up eat the frame budget and make capable devices look slow. It runs from `requestIdleCallback`, or after 2.5s where that does not exist (Safari).'),
          h('li', {}, h('strong', {}, 'Add a probe. '), 'A fixed, full-viewport, invisible, non-interactive element with `backdrop-filter: blur(18px)`. Full-viewport is the worst case, so a pass here covers any smaller surface.'),
          h('li', {}, h('strong', {}, 'Watch frames. '), `For ${SAMPLE_MS} ms it records the gap between consecutive \`requestAnimationFrame\` callbacks. At 60Hz a healthy gap is about 16.7 ms.`),
          h('li', {}, h('strong', {}, 'Skip the warm-up. '), `The first ${WARMUP_FRAMES} frames are ignored. Creating the compositing layer is a one-off cost, not the sustained cost being judged.`),
          h('li', {}, h('strong', {}, 'Count drops. '), `A frame that took longer than ${JANK_THRESHOLD_MS} ms is a dropped frame. That is 1.5 frames at 60Hz, so normal jitter does not count.`),
          h('li', {}, h('strong', {}, 'Decide. '), `Blur is granted if no more than ${pct(MAX_JANK_RATIO)} of the counted frames were dropped. The probe is removed and the result is cached.`)),
        table(['Constant', 'Value', 'Meaning'], [
          ['`SAMPLE_MS`', `${SAMPLE_MS}`, 'Length of the measuring window.'],
          ['`WARMUP_FRAMES`', `${WARMUP_FRAMES}`, 'Frames ignored at the start.'],
          ['`JANK_THRESHOLD_MS`', `${JANK_THRESHOLD_MS}`, 'A frame slower than this is dropped.'],
          ['`MAX_JANK_RATIO`', `${MAX_JANK_RATIO}`, 'Highest share of dropped frames that still passes.'],
        ]),
        h('p', {}, 'Edge cases resolve to "off". A browser without `backdrop-filter` fails at once. If the tab goes to the background mid-run, `requestAnimationFrame` stops and there are too few frames to trust, which also fails rather than guessing.')),

      section('Run it live', {},
        h('p', {}, 'This runs the library\'s own benchmark and draws every frame it sees. Each bar is one frame, as tall as it took. A bar that crosses the line is a dropped frame. The probe itself is invisible, so nothing on the page changes.'),
        benchmarkRunner()),

      section('Suggestions', {},
        h('p', {}, 'The benchmark is a good gate for a first visit, and a few changes would make its verdict more trustworthy:'),
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'Keep the probe measurable. '), 'While blur is off, the catch-all rule applies to the probe as well, and it is `!important`, so the probe\'s own blur has to be `!important` too or the run measures nothing. That is the case on every first visit, since off is the starting state.'),
          h('li', {}, h('strong', {}, 'Give the blur something to do. '), 'The probe sits over a static page and is fully transparent (`opacity: 0`). A browser is free to skip painting an invisible element, and a blur over unchanging content can be cached. A stricter test would use a nearly invisible probe (`opacity: 0.01`) over a moving element, so every frame needs a fresh blur. Check on a low-end device that it separates the ones that struggle.'),
          h('li', {}, h('strong', {}, 'Run more than one window. '), 'One 500 ms sample can catch a busy moment. Two or three short windows, judged together, are steadier at little cost.'),
          h('li', {}, h('strong', {}, 'Scale to the display. '), 'A fixed 24 ms line suits 60Hz. On a 120Hz display, judging against 2 to 3 refresh intervals would catch smaller slowdowns.'),
          h('li', {}, h('strong', {}, 'Re-check later, not just once. '), 'A verdict is per device, but devices change (battery saver, an external display). Consider expiring it after a few weeks, or re-running after a long dropped-frame streak in real use.'))),

      section('Overriding the result', {},
        h('p', {}, 'The benchmark can be wrong, and some people simply prefer one look. So the mode is a setting, stored under `lg:blur-mode`:'),
        table(['Mode', 'Behavior'], [
          ['`auto`', 'Default. Use the cached benchmark, running it once if there is none.'],
          ['`on`', 'Blur is always on. The benchmark is skipped.'],
          ['`off`', 'Blur is always off. The benchmark is skipped.'],
        ]),
        h('p', {}, 'Expose it as a setting, not just in code. The user should be able to see what was decided and change it. A segmented control is enough:'),
        codeBlock(`
import { getBlurMode, setBlurMode, applyBlurState, resolveBlurCapability, reevaluateBlurCapability } from 'liquid-glass-web';

createSegmentedControl(host, {
  items: ['auto', 'on', 'off'].map((v) => ({ value: v, label: v })),
  value: getBlurMode(),
  onSelect(v) {
    setBlurMode(v);
    applyBlurState(resolveBlurCapability());   // apply it now
    if (v === 'auto') reevaluateBlurCapability(); // and re-measure, so Auto has a fresh answer
  },
});`),
        h('p', {}, 'Try it here. This changes blur on the whole docs site:'),
        h('div', { class: 'card lg-glass' }, host)),

      section('Caching the result', {},
        h('p', {}, `The verdict is stored in \`localStorage\` under \`${BENCHMARK_CACHE_KEY}\` as \`{ "version": ${BLUR_BENCHMARK.VERSION}, "capable": true }\`, so the benchmark runs at most once per device. Later visits apply the cached verdict on the first frame and never measure again.`),
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'Versioned. '), 'The version is bumped whenever the test or its thresholds change, so a verdict from an older test is ignored and re-measured.'),
          h('li', {}, h('strong', {}, 'Failure-safe. '), 'If storage is blocked (private mode, quota), the read returns nothing and the write is skipped. Blur then stays off and the benchmark re-runs on the next visit, which is the safe direction to fail in.'),
          h('li', {}, h('strong', {}, 'Cleared on demand. '), 'Removing the key, or calling `reevaluateBlurCapability()`, forces a fresh run.')),
        codeBlock(`
localStorage.removeItem('${BENCHMARK_CACHE_KEY}');  // forget the verdict
await reevaluateBlurCapability();                  // or measure again right now`)),

      section('API', {},
        table(['Function', 'What it does'], [
          ['`initBlurCapability()`', 'Applies the current verdict and schedules the idle benchmark. Call once at startup.'],
          ['`getBlurMode()` / `setBlurMode(mode)`', 'Read or store the override: `auto`, `on` or `off`.'],
          ['`resolveBlurCapability()`', 'What blur should be right now. Never runs the benchmark.'],
          ['`applyBlurState(capable)`', 'Sets `data-blur` on `<html>` and fires `lg:blurstatechange`.'],
          ['`scheduleIdleBenchmark()`', 'Runs the benchmark once at idle, unless a verdict is cached or the mode is not `auto`.'],
          ['`reevaluateBlurCapability()`', 'Runs the benchmark now, caches and applies the result, and returns it.'],
          ['`runBlurBenchmark({ onFrame })`', 'Runs the measurement only, without caching or applying, and resolves to true or false. `onFrame` is called for each frame.'],
          ['`getCachedBlurVerdict()`', 'The cached verdict, or `null`.'],
        ])),
    ];
  },
};
