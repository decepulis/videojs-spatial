import { createModel } from './model';

/**
 * The portal. Holds the tray, whose bounding box becomes the stage that
 * `portal-transform: auto` fits into this element's box, so it has to enclose
 * every other model.
 */
export class SpatialStageElement extends HTMLElement {
  static readonly tagName = 'spatial-stage';

  #tray: HTMLElement | null = null;

  connectedCallback(): void {
    if (this.#tray) return;

    this.#tray = createModel('tray');
    this.#tray.setAttribute('aria-hidden', 'true');
    this.prepend(this.#tray);

    this.setAttribute('role', 'group');
    this.setAttribute('aria-label', 'Playback controls');
  }
}
