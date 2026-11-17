export type Part = 'tray' | 'puck' | 'play' | 'pause' | 'tile' | 'buffer' | 'fill' | 'thumb';

/** Whether this browser can put models in a shared 3D space. */
export const SPATIAL = typeof CSS !== 'undefined' && CSS.supports('spatial', 'portal');

/** Create a `<model>` for one of the generated USDZ files. Styled by `[data-part]` in spatial.css. */
export function createModel(part: Part): HTMLElement {
  const model = document.createElement('model');

  model.setAttribute('src', `${import.meta.env.BASE_URL}models/${part}.usdz`);
  model.dataset.part = part;

  return model;
}

/**
 * Set `--press` on a group of models while any of them is held, so they can
 * react together in CSS.
 */
export function trackPress(targets: HTMLElement[], group: HTMLElement[], signal: AbortSignal): void {
  const set = (value: number) => {
    for (const model of group) model.style.setProperty('--press', String(value));
  };

  for (const target of targets) {
    target.addEventListener('pointerdown', () => set(1), { signal });
    target.addEventListener('pointerup', () => set(0), { signal });
    target.addEventListener('pointercancel', () => set(0), { signal });
    target.addEventListener('pointerleave', () => set(0), { signal });
  }
}
