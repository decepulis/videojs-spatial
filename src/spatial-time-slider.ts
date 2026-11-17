import { selectBuffer, selectPlayback, selectTime, UIElement, type PropertyValues } from '@videojs/html';

import { createModel, trackPress } from './model';
import { PlayerController } from './player';

const STEP = 5;

/**
 * A timeline made of models: a row of tiles to seek with, a buffer bar and a
 * fill bar that scale along the track, and a thumb that rides the fill.
 *
 * Inside a portal the spec withholds pointer coordinates from the page, so a
 * click can't be turned into a position the usual way. Instead the track is
 * cut into tiles and the tile that was hit says where to seek.
 */
export class SpatialTimeSliderElement extends UIElement {
  static readonly tagName = 'spatial-time-slider';

  readonly #time = new PlayerController(this, selectTime);
  readonly #buffer = new PlayerController(this, selectBuffer);
  readonly #playback = new PlayerController(this, selectPlayback);

  readonly #tiles: HTMLElement[] = [];
  readonly #bufferBar = createModel('buffer');
  readonly #fill = createModel('fill');
  readonly #thumb = createModel('thumb');
  readonly #flat = document.createElement('input');

  #disconnect: AbortController | null = null;
  #drag: { pointerId: number; startX: number; startRatio: number; width: number } | null = null;

  override connectedCallback(): void {
    super.connectedCallback();

    if (!this.#thumb.isConnected) this.#render();

    this.#disconnect?.abort();
    this.#disconnect = new AbortController();
    const { signal } = this.#disconnect;

    this.#tiles.forEach((tile, index) => {
      tile.addEventListener('click', () => this.#seekToRatio((index + 0.5) / this.#tiles.length), { signal });
      trackPress([tile], [tile], signal);
    });

    this.#thumb.addEventListener('keydown', this.#handleKeydown, { signal });
    this.#thumb.addEventListener('pointerdown', this.#handleDragStart, { signal });
    this.#thumb.addEventListener('pointermove', this.#handleDragMove, { signal });
    this.#thumb.addEventListener('pointerup', this.#handleDragEnd, { signal });
    this.#thumb.addEventListener('pointercancel', this.#handleDragEnd, { signal });
    trackPress([this.#thumb], [this.#thumb], signal);

    this.#flat.addEventListener('input', () => this.#seekToRatio(this.#flat.valueAsNumber), { signal });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#disconnect?.abort();
    this.#disconnect = null;
    this.#drag = null;
  }

  protected override update(changed: PropertyValues): void {
    super.update(changed);

    const time = this.#time.value;
    if (!time) return;

    const { currentTime, duration } = time;
    const ratio = duration > 0 ? clamp(currentTime / duration) : 0;
    const gliding = !this.#playback.value?.paused && !time.seeking && !this.#drag;

    for (const model of [this.#fill, this.#thumb]) {
      model.toggleAttribute('data-gliding', gliding);
      model.style.setProperty('--amount', ratio.toFixed(5));
    }

    const bufferedEnd = this.#buffer.value?.buffered.find(([start, end]) => start <= currentTime && currentTime <= end);
    const buffered = duration > 0 && bufferedEnd ? clamp(bufferedEnd[1] / duration) : 0;
    this.#bufferBar.style.setProperty('--amount', buffered.toFixed(5));

    this.#thumb.setAttribute('aria-valuenow', String(Math.round(currentTime)));
    this.#thumb.setAttribute('aria-valuemax', String(Math.round(duration)));
    this.#thumb.setAttribute('aria-valuetext', `${formatTime(currentTime)} of ${formatTime(duration)}`);
    this.#flat.value = String(ratio);
  }

  #render(): void {
    const count = Number(getComputedStyle(document.documentElement).getPropertyValue('--track-count')) || 23;

    for (let index = 0; index < count; index++) {
      const tile = createModel('tile');
      tile.style.setProperty('--i', String(index));
      tile.setAttribute('aria-hidden', 'true');
      this.#tiles.push(tile);
    }

    this.#bufferBar.setAttribute('aria-hidden', 'true');
    this.#fill.setAttribute('aria-hidden', 'true');

    this.#thumb.setAttribute('role', 'slider');
    this.#thumb.setAttribute('tabindex', '0');
    this.#thumb.setAttribute('aria-label', 'Seek');
    this.#thumb.setAttribute('aria-valuemin', '0');

    this.#flat.type = 'range';
    this.#flat.className = 'flat';
    this.#flat.min = '0';
    this.#flat.max = '1';
    this.#flat.step = 'any';
    this.#flat.setAttribute('aria-label', 'Seek');

    this.append(...this.#tiles, this.#bufferBar, this.#fill, this.#thumb, this.#flat);
  }

  #seekToRatio(ratio: number): void {
    const time = this.#time.value;
    if (!time || !(time.duration > 0)) return;

    void time.seek(clamp(ratio) * time.duration);
  }

  #handleKeydown = (event: KeyboardEvent): void => {
    const time = this.#time.value;
    if (!time) return;

    const target =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? time.currentTime + STEP
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? time.currentTime - STEP
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? time.duration
              : null;
    if (target === null) return;

    // Handled here, so the player's own arrow-key hotkeys must not seek again.
    event.preventDefault();
    event.stopPropagation();
    void time.seek(Math.min(Math.max(target, 0), time.duration));
  };

  /*
   * Dragging the thumb is an experiment. It only works if the browser reports
   * pointer movement for a model in a portal, which the spec says it should not
   * do precisely. The lab's event log shows what actually arrives.
   */
  #handleDragStart = (event: PointerEvent): void => {
    const time = this.#time.value;
    const stage = this.closest('spatial-stage');
    if (!time || !stage || !(time.duration > 0)) return;

    const style = getComputedStyle(document.documentElement);
    const trackLength = parseFloat(style.getPropertyValue('--track-length'));
    const trayWidth = parseFloat(style.getPropertyValue('--tray-inner-width')) + 2 * parseFloat(style.getPropertyValue('--tray-rim'));
    const width = stage.getBoundingClientRect().width * (trackLength / trayWidth);
    if (!(width > 0)) return;

    this.#drag = { pointerId: event.pointerId, startX: event.clientX, startRatio: time.currentTime / time.duration, width };
    this.#thumb.setPointerCapture?.(event.pointerId);
  };

  #handleDragMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const delta = event.clientX - drag.startX;
    if (!Number.isFinite(delta) || delta === 0) return;

    this.#seekToRatio(drag.startRatio + delta / drag.width);
  };

  #handleDragEnd = (event: PointerEvent): void => {
    if (this.#drag?.pointerId !== event.pointerId) return;

    this.#drag = null;
    this.requestUpdate();
  };
}

function clamp(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
