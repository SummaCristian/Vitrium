// Demo overlay for the tab bar's press-mode prominent circle: the circle morphs
// into the overlay's search bar with a View Transition, and back on close.
import { icons } from '../src/index.js';

const NAME = 'demo-search-morph';

export function createSearchOverlay(getCircle) {
  const root = document.createElement('div');
  root.className = 'demo-search';
  root.hidden = true;
  root.innerHTML = `
    <div class="demo-search__row">
      <label class="demo-search__bar lg-glass"><span class="demo-search__icon"></span>
        <input class="demo-search__input" type="search" placeholder="Search" aria-label="Search"></label>
      <button type="button" class="demo-search__close lg-btn circle lg-glass lg-glass--circle liquid-glass" aria-label="Close">✕</button>
    </div>`;
  document.body.append(root);
  const bar = root.querySelector('.demo-search__bar');
  const input = root.querySelector('input');
  const icon = root.querySelector('.demo-search__icon');
  icon.append(typeof icons.search === 'string' ? Object.assign(document.createElement('span'), { innerHTML: icons.search }) : icons.search.cloneNode?.(true) ?? '');

  const swap = (update) => {
    if (!document.startViewTransition) { update(); return { finished: Promise.resolve() }; }
    return document.startViewTransition(update);
  };
  let open = false;

  function show() {
    const circle = getCircle();
    if (open || !circle) return;
    open = true;
    circle.style.viewTransitionName = NAME;
    swap(() => {
      circle.style.viewTransitionName = '';
      root.hidden = false;
      document.body.classList.add('demo-search-open');
      bar.style.viewTransitionName = NAME;
    }).finished.finally(() => { bar.style.viewTransitionName = ''; input.focus(); });
  }

  function hide() {
    const circle = getCircle();
    if (!open) return;
    open = false;
    bar.style.viewTransitionName = NAME;
    swap(() => {
      bar.style.viewTransitionName = '';
      root.hidden = true;
      document.body.classList.remove('demo-search-open');
      input.value = '';
      if (circle) circle.style.viewTransitionName = NAME;
    }).finished.finally(() => { if (circle) circle.style.viewTransitionName = ''; });
  }

  root.querySelector('.demo-search__close').addEventListener('click', hide);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  return { show, hide };
}
