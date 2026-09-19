import { createSheet } from '../src/index.js';

// The Explore tab: a busy, interactive backdrop standing in for a map, with the persistent
// sheet over it. The sheet must not block the backdrop.
export function mountExplore(root) {
  root.innerHTML = `
    <div id="backdrop">
      <button class="marker" id="m1" style="left: 12%; top: 18%">A</button>
      <button class="marker" id="m2" style="left: 70%; top: 24%">B</button>
      <button class="marker" id="m3" style="left: 42%; top: 40%">C</button>
    </div>
    <div id="readout">
      detent <b id="detent-out">-</b> &middot; height <b id="height-out">-</b> &middot; markers <b id="marker-count">0</b> &middot; header <b id="header-count">0</b>
    </div>`;
  const $ = (id) => document.getElementById(id);
  let markerCount = 0;
  for (const id of ['m1', 'm2', 'm3']) {
    $(id).addEventListener('click', () => { $('marker-count').textContent = String(++markerCount); });
  }

  const header = document.createElement('div');
  header.className = 'sheet-row';
  header.innerHTML = '<h2 class="sheet-title">Places</h2>';
  let headerCount = 0;
  const headerBtn = document.createElement('button');
  headerBtn.id = 'header-btn';
  headerBtn.textContent = 'Center';
  headerBtn.className = 'lg-btn pill lg-glass liquid-glass';
  headerBtn.addEventListener('click', () => { $('header-count').textContent = String(++headerCount); });
  header.appendChild(headerBtn);

  const list = document.createElement('div');
  list.id = 'list';
  for (let i = 1; i <= 40; i++) {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = `<span class="dot" style="background:hsl(${i * 25} 70% 60%)"></span><div><b>Place ${i}</b><br><small>Some details about place ${i}</small></div>`;
    list.appendChild(row);
  }
  const input = document.createElement('input');
  input.id = 'sheet-input';
  input.placeholder = 'Filter places';
  input.style.marginTop = '12px';
  list.appendChild(input);

  const params = new URLSearchParams(location.search);

  const sheet = createSheet({
    label: 'Places',
    header,
    content: list,
    detents: [
      { id: 'peek', size: 192 },
      { id: 'half', size: 0.5 },
      { id: 'full', size: 0.85 },
    ],
    responsive: [{ minWidth: 600, width: 420, align: 'end', margin: { inline: 20 } }],
    material: params.get('material') || 'auto',
    onDetentChange: (id) => { $('detent-out').textContent = id; },
    onResize: (px) => { $('height-out').textContent = String(Math.round(px)); },
  });
  $('detent-out').textContent = sheet.detent;
  $('height-out').textContent = String(Math.round(sheet.height));

  sheet.setHidden(true);
  return {
    sheet,
    show() { sheet.setHidden(false); },
    hide() { sheet.setHidden(true); },
  };
}
