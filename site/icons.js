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

export const navIcons = {
  home: toSvg(Home01Icon),
  start: toSvg(BookOpen01Icon),
  foundation: toSvg(Settings02Icon),
  components: toSvg(Compass01Icon),
};
