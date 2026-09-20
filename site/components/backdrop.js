import { h } from '../dom.js';

// A card with the animated colorful backdrop, so glass on it has something to blur. The animation (and the blur
// over it) repaints every frame, so it is paused while the card is off screen.
export function backdropCard(...children) {
  const stage = h('div', { class: 'stage' }, ...children);
  const card = h('div', { class: 'card stage-card stage--backdrop' }, stage);
  const io = new IntersectionObserver(([entry]) => {
    if (!card.isConnected) { io.disconnect(); return; }
    card.classList.toggle('paused', !entry.isIntersecting);
  });
  io.observe(card);
  return card;
}
