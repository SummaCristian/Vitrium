// Hash router: '#/components/toggle' -> { path: ['components', 'toggle'] }.
// Each route renders into `root` and may return a cleanup function.
export function createRouter(root, routes, { onChange } = {}) {
  let cleanup = null;
  const parse = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);

  let prev = parse();

  // A list <-> detail move inside one section: the card and the pane are the same thing at two sizes.
  const isZoom = (a, b) => a[0] === b[0] && Math.abs(a.length - b.length) === 1 && a[0] !== 'home';
  const cardFor = (path) => root.querySelector(`a.card-link[href="#/${path.join('/')}"]`);

  function swap(path) {
    const [top = 'home', ...rest] = path;
    const route = routes[top] ?? routes.home;
    cleanup?.();
    root.replaceChildren();
    cleanup = route.render(root, rest) ?? null;
    onChange?.(routes[top] ? top : 'home');
    window.scrollTo(0, 0);
  }

  function render() {
    const path = parse();
    const from = prev;
    prev = path;
    const zoom = document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches && isZoom(from, path);
    if (!zoom) { swap(path); return; }

    // Opening: the card is named before the swap, the new pane after it. Closing: the other way round.
    // Only these two are named, so the sidebar and everything around the pane just cross-fades.
    const opening = path.length > from.length;
    const before = opening ? cardFor(path) : root;
    if (before) before.style.viewTransitionName = 'page-zoom';
    let after;
    document.documentElement.dataset.zoom = opening ? 'open' : 'close';
    const vt = document.startViewTransition(() => {
      if (before) before.style.viewTransitionName = '';
      swap(path);
      after = opening ? root : cardFor(from);
      if (after) after.style.viewTransitionName = 'page-zoom';
    });
    const done = () => { delete document.documentElement.dataset.zoom; root.style.viewTransitionName = ''; if (after) after.style.viewTransitionName = ''; };
    vt.ready.catch(() => {});
    vt.finished.then(done, done);
  }

  window.addEventListener('hashchange', render);
  return { render, go: (hash) => { location.hash = hash; } };
}
