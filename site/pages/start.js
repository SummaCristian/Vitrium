import { h, breadcrumbs } from '../dom.js';
import getStarted from '../guides/get-started.js';
import frameworks from '../guides/frameworks.js';
import ssr from '../guides/ssr.js';
import browserSupport from '../guides/browser-support.js';
import accessibility from '../guides/accessibility.js';
import theming from '../guides/theming.js';

// One file per guide in site/guides/. Each exports { id, title, abstract, sections(guides) }. #/start is the first one
// (Get started); the rest are #/start/<id>. Add a guide by creating a file there and listing it here, in order.
export const guidePages = [getStarted, frameworks, ssr, browserSupport, accessibility, theming];

export const guideById = (id) => guidePages.find((g) => g.id === id);
export const guideHref = (g) => (g === guidePages[0] ? '#/start' : `#/start/${g.id}`);

export const start = {
  render(root, [id]) {
    const guide = id ? guideById(id) : guidePages[0];
    const first = guide === guidePages[0];
    root.append(
      h('header', { class: 'doc-head' },
        first ? null : breadcrumbs([{ label: 'Guides', href: '#/start' }, { label: guide.title }]),
        h('h1', {}, guide.title),
        h('p', { class: 'lede' }, guide.abstract)),
      ...guide.sections(guidePages),
    );
  },
};
