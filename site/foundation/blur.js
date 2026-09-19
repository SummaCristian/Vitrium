import { getBlurMode, setBlurMode, applyBlurState, resolveBlurCapability, createSegmentedControl } from '../../src/index.js';
import { h, section } from '../dom.js';

export default {
  id: 'blur',
  title: 'Blur',
  abstract: 'Backdrop blur is benchmarked and can be forced on or off.',
  sections() {
    const host = h('div');
    createSegmentedControl(host, {
      items: ['auto', 'on', 'off'].map((v) => ({ value: v, label: v })), value: getBlurMode(),
      onSelect(v, { silent }) { if (silent) return; setBlurMode(v); applyBlurState(resolveBlurCapability()); },
    });
    return [
      section('Overview', {}, h('p', {}, 'Backdrop blur is the most expensive part of the glass. initBlurCapability() starts with blur off, benchmarks the device when it is idle, and switches it on only if it holds up. You can override that with a mode.')),
      section('Try it', { card: true }, host),
    ];
  },
};
