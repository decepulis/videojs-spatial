import { selectPlayback, UIElement, type PropertyValues } from '@videojs/html';

import { createModel, trackPress } from './model';
import { PlayerController } from './player';

/**
 * A play button made of three models: a puck, and a play and a pause glyph
 * that trade places on its face.
 */
export class SpatialPlayButtonElement extends UIElement {
  static readonly tagName = 'spatial-play-button';

  readonly #playback = new PlayerController(this, selectPlayback);

  readonly #puck = createModel('puck');
  readonly #play = createModel('play');
  readonly #pause = createModel('pause');
  readonly #flat = document.createElement('button');

  #disconnect: AbortController | null = null;

  override connectedCallback(): void {
    super.connectedCallback();

    const models = [this.#puck, this.#play, this.#pause];

    if (!this.#puck.isConnected) {
      this.#puck.setAttribute('role', 'button');
      this.#puck.setAttribute('tabindex', '0');
      this.#play.setAttribute('aria-hidden', 'true');
      this.#pause.setAttribute('aria-hidden', 'true');
      this.#flat.type = 'button';
      this.#flat.className = 'flat';
      this.append(...models, this.#flat);
    }

    this.#disconnect?.abort();
    this.#disconnect = new AbortController();
    const { signal } = this.#disconnect;

    for (const target of [...models, this.#flat]) {
      target.addEventListener('click', this.#toggle, { signal });
    }
    this.#puck.addEventListener('keydown', this.#handleKeydown, { signal });
    this.#puck.addEventListener('keyup', this.#handleKeyup, { signal });
    trackPress(models, models, signal);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#disconnect?.abort();
    this.#disconnect = null;
  }

  protected override update(changed: PropertyValues): void {
    super.update(changed);

    const playback = this.#playback.value;
    if (!playback) return;

    // The glyph shows what pressing the button will do.
    const label = playback.paused ? 'Play' : 'Pause';

    this.#play.toggleAttribute('data-active', playback.paused);
    this.#pause.toggleAttribute('data-active', !playback.paused);
    this.#puck.setAttribute('aria-label', label);
    this.#flat.textContent = label;
  }

  #toggle = (): void => {
    const playback = this.#playback.value;
    if (!playback) return;

    if (playback.paused) void playback.play();
    else playback.pause();
  };

  #handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.#toggle();
    } else if (event.key === ' ') {
      event.preventDefault();
    }
  };

  // ARIA button pattern: Space activates on keyup.
  #handleKeyup = (event: KeyboardEvent): void => {
    if (event.key !== ' ') return;

    // Keep the player's own Space hotkey from toggling a second time.
    event.stopPropagation();
    this.#toggle();
  };
}
