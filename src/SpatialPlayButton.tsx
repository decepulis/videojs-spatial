import { selectPlayback } from '@videojs/react';
import type { KeyboardEvent } from 'react';

import { Model } from './Model';
import { usePlayer } from './player';
import { usePress } from './use-press';

/**
 * A play button made of three models: a puck, and a play and a pause glyph
 * that trade places on its face. Returns a fragment, so all three are direct
 * children of the portal.
 */
export function SpatialPlayButton() {
  const playback = usePlayer(selectPlayback);
  const [pressed, pressHandlers] = usePress();

  const paused = playback?.paused ?? true;
  // The glyph shows what pressing the button will do.
  const label = paused ? 'Play' : 'Pause';

  const toggle = () => {
    if (!playback) return;

    if (playback.paused) void playback.play();
    else playback.pause();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      toggle();
    } else if (event.key === ' ') {
      event.preventDefault();
    }
  };

  // ARIA button pattern: Space activates on keyup. The player's Space hotkey
  // listens for keydown and leaves Space on a role="button" element alone.
  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.key === ' ') toggle();
  };

  const shared = { ...pressHandlers, onClick: toggle, style: { '--press': pressed ? 1 : 0 } };

  return (
    <>
      <Model
        part="puck"
        role="button"
        tabIndex={0}
        aria-label={label}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        {...shared}
      />
      <Model part="play" aria-hidden="true" data-active={paused || undefined} {...shared} />
      <Model part="pause" aria-hidden="true" data-active={!paused || undefined} {...shared} />
    </>
  );
}
