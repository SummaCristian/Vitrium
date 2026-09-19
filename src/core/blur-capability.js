// Perf-gated glass blur. backdrop-filter is expensive to composite on weak
// GPUs, so instead of granting it everywhere we benchmark it once and cache
// the verdict. No blur is the safe baseline: until a verdict exists,
// [data-blur="off"] disables every backdrop-filter and swaps the glass tint
// for a near-opaque one (see styles/tokens.css). Blur is granted, never assumed.
//
// The benchmark must NOT run during page load — layout, font/image work and
// JIT warm-up eat frame budget and produce false negatives on capable
// devices. `initBlurCapability()` therefore applies the cached/safe verdict
// instantly and schedules the real benchmark for post-load idle time. It runs
// at most once per device (cached afterwards).

export const BLUR_MODE_KEY = 'lg:blur-mode';            // 'auto' | 'on' | 'off'
const BENCHMARK_CACHE_KEY = 'lg:blur-benchmark';
// Bump when the benchmark logic or thresholds change so stale verdicts re-run.
const BENCHMARK_VERSION = 1;

const IDLE_RECHECK_DELAY_MS = 2500; // requestIdleCallback fallback (Safari)
const SAMPLE_MS = 500;              // benchmark window, ~30 frames at 60fps
const WARMUP_FRAMES = 3;            // one-time compositing-layer setup, not sustained cost
const JANK_THRESHOLD_MS = 24;       // slower than this counts as a dropped frame
const MAX_JANK_RATIO = 0.3;         // capable if < 30% of sampled frames dropped

export const BLUR_STATE_EVENT = 'lg:blurstatechange';

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode / quota */ } },
};

export function getBlurMode() {
  return store.get(BLUR_MODE_KEY) ?? 'auto';
}

export function setBlurMode(mode) {
  store.set(BLUR_MODE_KEY, mode);
}

function readCachedResult() {
  try {
    const parsed = JSON.parse(store.get(BENCHMARK_CACHE_KEY));
    return parsed?.version === BENCHMARK_VERSION ? parsed.capable : null;
  } catch {
    return null;
  }
}

function writeCachedResult(capable) {
  store.set(BENCHMARK_CACHE_KEY, JSON.stringify({ version: BENCHMARK_VERSION, capable }));
}

function supportsBackdropFilter() {
  return CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
}

// Renders an offscreen full-viewport blurred panel and measures rAF frame gaps
// while it's composited, so the sample reflects real compositing cost.
function runBenchmark() {
  return new Promise(resolve => {
    if (!supportsBackdropFilter()) return resolve(false);

    const probe = document.createElement('div');
    probe.style.cssText = `
      position: fixed; inset: 0; opacity: 0; pointer-events: none; z-index: -1;
      background: rgba(250, 250, 250, 0.7);
      backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
    `;
    document.body.appendChild(probe);

    const start = performance.now();
    let lastTime = start, totalFrames = 0, jankFrames = 0;

    function tick(now) {
      totalFrames++;
      if (totalFrames > WARMUP_FRAMES && now - lastTime > JANK_THRESHOLD_MS) jankFrames++;
      lastTime = now;
      if (now - start < SAMPLE_MS) return requestAnimationFrame(tick);

      probe.remove();
      const sampled = totalFrames - WARMUP_FRAMES;
      // Too few frames to trust (tab backgrounded mid-sample) isn't "capable".
      resolve(sampled > 1 && jankFrames / sampled <= MAX_JANK_RATIO);
    }
    requestAnimationFrame(tick);
  });
}

// What blur should do *right now*, honoring the manual override, without ever
// running the benchmark. 'auto' with no cached verdict → the safe "off".
export function resolveBlurCapability() {
  const mode = getBlurMode();
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  if (window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches) return false;
  return readCachedResult() ?? false;
}

// Sets [data-blur] on <html> and fires BLUR_STATE_EVENT (for shadow-DOM
// components that can't inherit :root custom properties).
export function applyBlurState(capable) {
  document.documentElement.dataset.blur = capable ? 'on' : 'off';
  window.dispatchEvent(new CustomEvent(BLUR_STATE_EVENT, { detail: { capable } }));
}

// One-time idle benchmark; no-op if a verdict is cached or the mode isn't 'auto'.
export function scheduleIdleBenchmark() {
  if (getBlurMode() !== 'auto' || readCachedResult() !== null) return;

  const run = () => {
    // Mode/cache may have changed while waiting — don't clobber it.
    if (getBlurMode() !== 'auto' || readCachedResult() !== null) return;
    runBenchmark().then(capable => {
      writeCachedResult(capable);
      applyBlurState(capable);
    });
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(run, { timeout: IDLE_RECHECK_DELAY_MS + 1500 });
  } else {
    setTimeout(run, IDLE_RECHECK_DELAY_MS);
  }
}

// Re-runs and re-caches the benchmark now (e.g. the user switched back to "Auto").
export async function reevaluateBlurCapability() {
  const capable = await runBenchmark();
  writeCachedResult(capable);
  applyBlurState(capable);
  return capable;
}

// One-call setup: apply the instant verdict, then benchmark at idle time.
export function initBlurCapability() {
  applyBlurState(resolveBlurCapability());
  scheduleIdleBenchmark();
}
