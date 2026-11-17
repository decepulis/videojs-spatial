import { selectTime } from '@videojs/react';

import { usePlayer } from './player';
import { playedRatio, seekToRatio } from './timeline';

/** The timeline for browsers without portals. */
export function FlatTimeSlider() {
  const time = usePlayer(selectTime);

  return (
    <input
      type="range"
      className="flat"
      min={0}
      max={1}
      step="any"
      aria-label="Seek"
      value={playedRatio(time)}
      onChange={(event) => seekToRatio(time, event.currentTarget.valueAsNumber)}
    />
  );
}
