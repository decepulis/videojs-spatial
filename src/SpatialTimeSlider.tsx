import { selectBuffer, selectPlayback, selectTime } from '@videojs/react';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { Model } from './Model';
import { usePlayer } from './player';
import { SpatialTile } from './SpatialTile';
import { clamp, formatTime, playedRatio, seekToRatio } from './timeline';
import { usePress } from './use-press';

const STEP = 5;

interface Drag {
  pointerId: number;
  startX: number;
  startRatio: number;
  width: number;
}

/**
 * A timeline made of models: a row of tiles to seek with, a buffer bar and a
 * fill bar that scale along the track, and a thumb that rides the fill.
 *
 * Inside a portal the spec withholds pointer coordinates from the page, so a
 * click can't be turned into a position the usual way. Instead the track is
 * cut into tiles and the tile that was hit says where to seek.
 */
export function SpatialTimeSlider() {
  const time = usePlayer(selectTime);
  const buffer = usePlayer(selectBuffer);
  const playback = usePlayer(selectPlayback);

  const [count] = useState(readTrackCount);
  const [thumbPressed, thumbPressHandlers] = usePress();
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);

  const currentTime = time?.currentTime ?? 0;
  const duration = time?.duration ?? 0;
  const ratio = playedRatio(time);
  const gliding = !playback?.paused && !time?.seeking && !dragging;

  const bufferedRange = buffer?.buffered.find(([start, end]) => start <= currentTime && currentTime <= end);
  const buffered = duration > 0 && bufferedRange ? clamp(bufferedRange[1] / duration) : 0;

  const handleTile = (index: number) => seekToRatio(time, (index + 0.5) / count);

  // Capture phase: React's bubbling handlers run only after the event has passed
  // the player container, where the arrow-key hotkeys listen. They skip events
  // whose default was prevented, so the slider must get there first.
  const handleKeyDownCapture = (event: KeyboardEvent) => {
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

    event.preventDefault();
    void time.seek(Math.min(Math.max(target, 0), time.duration));
  };

  /*
   * Dragging the thumb is an experiment. It only works if the browser reports
   * pointer movement for a model in a portal, which the spec says it should not
   * do precisely. The lab's event log shows what actually arrives.
   */
  const handleDragStart = (event: PointerEvent<HTMLElement>) => {
    const stage = event.currentTarget.closest('.spatial-stage');
    if (!time || !stage || !(time.duration > 0)) return;

    const style = getComputedStyle(document.documentElement);
    const trackLength = parseFloat(style.getPropertyValue('--track-length'));
    const trayWidth =
      parseFloat(style.getPropertyValue('--tray-inner-width')) + 2 * parseFloat(style.getPropertyValue('--tray-rim'));
    const width = stage.getBoundingClientRect().width * (trackLength / trayWidth);
    if (!(width > 0)) return;

    drag.current = { pointerId: event.pointerId, startX: event.clientX, startRatio: time.currentTime / time.duration, width };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleDragMove = (event: PointerEvent) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;

    const delta = event.clientX - current.startX;
    if (!Number.isFinite(delta) || delta === 0) return;

    seekToRatio(time, current.startRatio + delta / current.width);
  };

  const handleDragEnd = (event: PointerEvent) => {
    if (drag.current?.pointerId !== event.pointerId) return;

    drag.current = null;
    setDragging(false);
  };

  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <SpatialTile key={index} index={index} onSelect={handleTile} />
      ))}
      <Model part="buffer" aria-hidden="true" style={{ '--amount': buffered.toFixed(5) }} />
      <Model
        part="fill"
        aria-hidden="true"
        data-gliding={gliding || undefined}
        style={{ '--amount': ratio.toFixed(5) }}
      />
      <Model
        part="thumb"
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuenow={Math.round(currentTime)}
        aria-valuemax={Math.round(duration)}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
        data-gliding={gliding || undefined}
        style={{ '--amount': ratio.toFixed(5), '--press': thumbPressed ? 1 : 0 }}
        onKeyDownCapture={handleKeyDownCapture}
        onPointerDown={(event) => {
          thumbPressHandlers.onPointerDown();
          handleDragStart(event);
        }}
        onPointerMove={handleDragMove}
        onPointerUp={(event) => {
          thumbPressHandlers.onPointerUp();
          handleDragEnd(event);
        }}
        onPointerCancel={(event) => {
          thumbPressHandlers.onPointerCancel();
          handleDragEnd(event);
        }}
        onPointerLeave={thumbPressHandlers.onPointerLeave}
      />
    </>
  );
}

function readTrackCount(): number {
  return Number(getComputedStyle(document.documentElement).getPropertyValue('--track-count')) || 23;
}
