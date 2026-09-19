// Hash router: '#/components/toggle' -> { path: ['components', 'toggle'] }.
// Each route renders into `root` and may return a cleanup function.
export function createRouter(root, routes, { onChange } = {}) {
  let cleanup = null;
  const parse = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);

  function render() {
    const path = parse();
    const [top = 'home', ...rest] = path;
    const route = routes[top] ?? routes.home;
    cleanup?.();
    root.replaceChildren();
    cleanup = route.render(root, rest) ?? null;
    onChange?.(routes[top] ? top : 'home');
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', render);
  return { render, go: (hash) => { location.hash = hash; } };
}
