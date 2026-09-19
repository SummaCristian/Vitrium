import '../src/styles/index.css';
import { initLiquidGlass, initBlurCapability, getBlurMode, setBlurMode, applyBlurState, resolveBlurCapability } from '../src/index.js';

initLiquidGlass();
initBlurCapability();

const cycle = (values, current) => values[(values.indexOf(current) + 1) % values.length];

const themeBtn = document.getElementById('theme');
themeBtn.addEventListener('click', () => {
  const next = cycle(['auto', 'light', 'dark'], themeBtn.dataset.mode ?? 'auto');
  themeBtn.dataset.mode = next;
  if (next === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = next;
  themeBtn.textContent = `Theme: ${next}`;
});

const blurBtn = document.getElementById('blur');
const renderBlur = () => { blurBtn.textContent = `Blur: ${getBlurMode()}`; };
renderBlur();
blurBtn.addEventListener('click', () => {
  setBlurMode(cycle(['auto', 'on', 'off'], getBlurMode()));
  applyBlurState(resolveBlurCapability());
  renderBlur();
});
