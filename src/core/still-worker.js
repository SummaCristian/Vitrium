// The still reflection's pixels (still-math.js), worked out here, off the page's thread (core/refraction.js,
// runStill). A worker with no 2D canvas of its own (an older Safari) says so, and the page works them out itself.
import { stillPixels, canPaint } from './still-math.js';

const paints = canPaint();
self.onmessage = ({ data: { id, job } }) => {
  if (!paints) { self.postMessage({ id, error: 'no canvas' }); return; }
  try {
    const out = stillPixels(job);
    self.postMessage({ id, ...out }, [out.light.buffer, out.band.buffer]);
  } catch (e) {
    self.postMessage({ id, error: String(e) });
  }
};
