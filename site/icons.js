// Hugeicons data -> SVG strings, as accepted by the tab bar's `icon`.
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon';
import Compass01Icon from '@hugeicons/core-free-icons/Compass01Icon';
import BookOpen01Icon from '@hugeicons/core-free-icons/BookOpen01Icon';
import Settings02Icon from '@hugeicons/core-free-icons/Settings02Icon';

const toSvg = (data) => {
  const body = data.map(([tag, { key, ...attrs }]) =>
    `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="${v}"`).join(' ')}/>`).join('');
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${body}</svg>`;
};

const stroke = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${d}</svg>`;

export const navIcons = {
  menu: stroke('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  sidebar: stroke('<rect x="3" y="4.5" width="18" height="15" rx="3.5"/><path d="M9.5 4.5v15"/>'),
  home: toSvg(Home01Icon),
  start: toSvg(BookOpen01Icon),
  foundation: toSvg(Settings02Icon),
  components: toSvg(Compass01Icon),
};
