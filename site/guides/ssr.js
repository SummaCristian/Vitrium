import { h, section, codeBlock, table } from '../dom.js';

export default {
  id: 'ssr',
  title: 'Server-side rendering',
  abstract: 'Import it on the server, create it on the client, and avoid a flash of the wrong theme.',
  sections() {
    return [
      section('What runs where', {},
        h('p', {}, 'The components build DOM, so they can only be created where a DOM exists: in the browser. Importing the package is a different matter, and is safe anywhere. It does not touch the document or the window when it loads, and the few places that check for `matchMedia` at load guard it, so a server render that merely imports it will not throw.'),
        table(['Where', 'What you can do'], [
          ['On the server', 'Import the package and its styles. Render the markup around the components, such as the container each one goes in.'],
          ['In the browser', 'Create the components, and call `initLiquidGlass()` and `initBlurCapability()`.'],
        ])),

      section('Create in a client-only hook', {},
        h('p', {}, 'Run creation after the page has mounted: `useEffect` in React, `onMounted` in Vue, `onMount` in Svelte, or a plain script that runs on load. Server-render an empty container, and fill it once you are on the client.'),
        codeBlock(`
// Next.js, Nuxt, SvelteKit and the like: only ever run this in the browser.
useEffect(() => {
  const toggle = createToggle({ value, label });
  host.current.append(toggle.el);
  return () => toggle.destroy();
}, []);`),
        h('p', {}, 'If your framework lets a component opt out of server rendering, that is another way to do it. See Using a framework for the full pattern.')),

      section('Styles', {},
        h('p', {}, 'The stylesheet is ordinary CSS, so import it as you would any other, and it is part of the server-rendered page. Glass already looks right before any JavaScript has run: the material, the colors and the light and dark themes are all CSS. Only behavior, the springs and the measured layout, waits for the client.')),

      section('No flash of the wrong theme', {},
        h('p', {}, 'With no setting, the theme follows `prefers-color-scheme` from CSS alone, so there is nothing to flash. If you also let people pin a theme and remember it, the pinned value has to be on `<html>` before the first paint, or a returning dark-mode visitor sees a light page for a moment. Set it from a small inline script in the head:'),
        codeBlock(`
<script>
  try {
    const theme = localStorage.getItem('theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  } catch {}
</script>`, 'html'),
        h('p', {}, 'Use whatever key your own theme switch stores. See Theme for the values.')),

      section('Space for the tab bar', {},
        h('p', {}, 'The tab bar publishes how much room it takes as CSS variables, but it can only do that once it exists. Until then the page has no padding for it, and content jumps when the bar appears. Give the variables a fallback in your CSS, which is what they are for, and reserve the room you know it will use:'),
        codeBlock(`
body {
  padding-bottom: var(--lg-tabbar-bottom-space, 6rem);   /* until the bar has measured itself */
}`, 'text')),

      section('Blur', {},
        h('p', {}, '`initBlurCapability()` is client-only, and it starts with blur off and waits for the device to be idle. A server render cannot know the device, so it always shows the default. Nothing here needs special handling: when `initBlurCapability()` runs on the client it applies the last verdict from storage straight away, if there is one, and measures only when there is none.')),
    ];
  },
};
