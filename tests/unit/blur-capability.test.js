import { beforeEach, describe, expect, it } from 'vitest';
import {
  BLUR_BENCHMARK, BLUR_MODE_KEY, BLUR_STATE_EVENT, applyBlurState, getBlurMode, getCachedBlurVerdict,
  resolveBlurCapability, setBlurMode,
} from '../../src/core/blur-capability.js';

// The module reads localStorage, matchMedia and the document lazily, so plain stubs are enough to test its decisions.
const CACHE_KEY = BLUR_BENCHMARK.BENCHMARK_CACHE_KEY;
let storage, reducedTransparency, dispatched, root;

beforeEach(() => {
  storage = new Map();
  reducedTransparency = false;
  dispatched = [];
  root = { dataset: {} };
  globalThis.localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
  };
  globalThis.window = {
    matchMedia: (q) => ({ matches: q.includes('prefers-reduced-transparency') && reducedTransparency }),
    dispatchEvent: (e) => dispatched.push(e),
  };
  globalThis.document = { documentElement: root };
});

const cache = (capable, version = BLUR_BENCHMARK.VERSION) => storage.set(CACHE_KEY, JSON.stringify({ version, capable }));

describe('the blur mode', () => {
  it('is auto until it is set', () => {
    expect(getBlurMode()).toBe('auto');
  });

  it('is remembered', () => {
    setBlurMode('off');
    expect(storage.get(BLUR_MODE_KEY)).toBe('off');
    expect(getBlurMode()).toBe('off');
  });
});

describe('the cached verdict', () => {
  it('is null when there is none', () => {
    expect(getCachedBlurVerdict()).toBeNull();
  });

  it('is what the benchmark stored', () => {
    cache(true);
    expect(getCachedBlurVerdict()).toBe(true);
    cache(false);
    expect(getCachedBlurVerdict()).toBe(false);
  });

  it('is ignored when it came from an older version of the test, so it is measured again', () => {
    cache(true, BLUR_BENCHMARK.VERSION - 1);
    expect(getCachedBlurVerdict()).toBeNull();
  });

  it('is ignored when it cannot be read', () => {
    storage.set(CACHE_KEY, '{not json');
    expect(getCachedBlurVerdict()).toBeNull();
  });
});

describe('what blur should do right now', () => {
  it('is off on a first visit: blur is granted, never assumed', () => {
    expect(resolveBlurCapability()).toBe(false);
  });

  it('follows the cached verdict in auto', () => {
    cache(true);
    expect(resolveBlurCapability()).toBe(true);
    cache(false);
    expect(resolveBlurCapability()).toBe(false);
  });

  it('is forced on or off by the mode, whatever was cached', () => {
    cache(false);
    setBlurMode('on');
    expect(resolveBlurCapability()).toBe(true);
    cache(true);
    setBlurMode('off');
    expect(resolveBlurCapability()).toBe(false);
  });

  it('is off in auto when the user prefers reduced transparency, even with a passing verdict', () => {
    cache(true);
    reducedTransparency = true;
    expect(resolveBlurCapability()).toBe(false);
  });

  it('lets an explicit "on" win over reduced transparency', () => {
    reducedTransparency = true;
    setBlurMode('on');
    expect(resolveBlurCapability()).toBe(true);
  });
});

describe('applying the state', () => {
  it('sets data-blur on the root and announces it', () => {
    applyBlurState(true);
    expect(root.dataset.blur).toBe('on');
    applyBlurState(false);
    expect(root.dataset.blur).toBe('off');
    expect(dispatched).toHaveLength(2);
    expect(dispatched[0].type).toBe(BLUR_STATE_EVENT);
    expect(dispatched[0].detail).toEqual({ capable: true });
  });
});

describe('the benchmark numbers', () => {
  it('are the ones the docs describe', () => {
    expect(BLUR_BENCHMARK.SAMPLE_MS).toBe(500);
    expect(BLUR_BENCHMARK.WARMUP_FRAMES).toBe(3);
    expect(BLUR_BENCHMARK.JANK_THRESHOLD_MS).toBe(24);
    expect(BLUR_BENCHMARK.MAX_JANK_RATIO).toBe(0.3);
  });
});
