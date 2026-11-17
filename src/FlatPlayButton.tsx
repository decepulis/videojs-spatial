import { selectPlayback } from '@videojs/react';

import { usePlayer } from './player';

/** The play button for browsers without portals. */
export function FlatPlayButton() {
  const playback = usePlayer(selectPlayback);

  const paused = playback?.paused ?? true;

  const toggle = () => {
    if (!playback) return;

    if (playback.paused) void playback.play();
    else playback.pause();
  };

  return (
    <button type="button" className="flat" onClick={toggle}>
      {paused ? 'Play' : 'Pause'}
    </button>
  );
}
