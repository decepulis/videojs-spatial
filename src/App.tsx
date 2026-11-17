import { Container, Hotkey, Time } from '@videojs/react';
import { Video } from '@videojs/react/video';
import { useRef } from 'react';

import { FlatPlayButton } from './FlatPlayButton';
import { FlatTimeSlider } from './FlatTimeSlider';
import { Lab } from './Lab';
import { Player } from './player';
import { SpatialPlayButton } from './SpatialPlayButton';
import { SpatialTimeSlider } from './SpatialTimeSlider';
import { Stage } from './Stage';
import { SPATIAL } from './support';
import { useLabSettings } from './use-lab-settings';

const SRC = 'https://stream.mux.com/BV3YZtogl89mg9VcNBhhnHm02Y34zI1nlMuMQfAbl3dM/highest.mp4';

export function App() {
  const [settings, setSetting] = useLabSettings();
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <main>
      <header>
        <h1>Video.js × spatial CSS</h1>
        <p>
          A player whose controls are 3D models in a <code>spatial: portal</code>. Needs Safari on visionOS 27.3 with{' '}
          <em>Settings › Apps › Safari › Advanced › Feature flags › CSS Portals</em> turned on. Everywhere else you get
          flat controls.
        </p>
      </header>

      <Player>
        <Container className="media-container">
          {/* crossOrigin so ambient.ts may read the frame's pixels. */}
          <Video ref={videoRef} src={SRC} crossOrigin="anonymous" playsInline preload="metadata" />

          {/* Every <model> is a direct child of the portal: the controls render fragments. */}
          <Stage ref={stageRef} spatial={SPATIAL} settings={settings}>
            {SPATIAL ? (
              <>
                <SpatialPlayButton />
                <SpatialTimeSlider />
              </>
            ) : (
              <>
                <FlatPlayButton />
                <FlatTimeSlider />
              </>
            )}
          </Stage>

          <p className="readout">
            <Time.Value type="current" />
            <Time.Separator> / </Time.Separator>
            <Time.Value type="duration" />
          </p>

          <Hotkey keys="Space" action="togglePaused" />
          <Hotkey keys="ArrowLeft" action="seekStep" value={-5} />
          <Hotkey keys="ArrowRight" action="seekStep" value={5} />
        </Container>
      </Player>

      <Lab stageRef={stageRef} videoRef={videoRef} settings={settings} onSettingChange={setSetting} />
    </main>
  );
}
