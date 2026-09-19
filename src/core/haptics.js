// Pluggable haptics. The package never depends on a haptics library: it calls
// `haptics.trigger(kind)` with a semantic name ('light' | 'error' | ...) and
// the host decides what that does. The default uses navigator.vibrate where
// available (Android; iOS Safari has no Vibration API) and is a no-op elsewhere.
//
//   import { WebHaptics, defaultPatterns } from 'web-haptics';
//   const wh = new WebHaptics();
//   setHaptics({ trigger: (kind) => wh.trigger(defaultPatterns[kind]) });

const VIBRATE = {
  light: 10,
  medium: 20,
  success: [15, 40, 20],
  warning: [20, 50, 20],
  error: [30, 50, 30],
};

const vibrateProvider = {
  trigger(kind = 'light') {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;
    navigator.vibrate(VIBRATE[kind] ?? VIBRATE.light);
  },
};

let provider = vibrateProvider;

// Pass `null` to silence haptics entirely, or `{ trigger(kind) }` to plug in your own.
export function setHaptics(next) {
  provider = next ?? { trigger() {} };
}

export const haptics = {
  trigger(kind = 'light') {
    try { provider.trigger(kind); } catch { /* haptics must never break UI */ }
  },
};
