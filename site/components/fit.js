// Keeps a segmented control inside its container: a row while it fits, a column when it would not, so a long list of
// choices never overflows a narrow screen. It measures the row once, while it is one, and compares that with the room
// the control has, from its own left edge to the container's right edge.
export function fitSegmented(host, control) {
  let needed = 0;
  let watching = false;
  let first = true;
  const isColumn = () => host.classList.contains('lg-seg--vertical');
  const fit = () => {
    const parent = host.closest('.card') ?? host.parentElement;
    if (!parent) return;
    if (!isColumn() && !host.classList.contains('lg-seg--morphing')) needed = host.offsetWidth;
    const box = parent.getBoundingClientRect();
    const room = box.right - (parseFloat(getComputedStyle(parent).paddingRight) || 0) - host.getBoundingClientRect().left;
    if (!needed || room <= 0) return;
    const column = needed > room;
    if (column !== isColumn()) control.setOrientation(column ? 'vertical' : 'horizontal', { animate: !first });
    first = false;
  };
  const ro = new ResizeObserver(() => {
    // The container is only known once the control is in the page.
    const box = host.closest('.card') ?? host.parentElement;
    if (!watching && box) { watching = true; ro.observe(box); }
    fit();
  });
  ro.observe(host);
  return control;
}
