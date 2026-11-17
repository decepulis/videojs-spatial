import type { ReactNode, Ref } from 'react';

import { Model } from './Model';
import type { LabSettings } from './use-lab-settings';

interface StageProps {
  ref?: Ref<HTMLDivElement>;
  spatial: boolean;
  settings: LabSettings;
  children: ReactNode;
}

/**
 * The portal. Holds the tray, whose bounding box becomes the stage that
 * `portal-transform: auto` fits into this element's box, so it has to enclose
 * every other model. Without portal support it is a plain row of flat controls.
 */
export function Stage({ ref, spatial, settings, children }: StageProps) {
  return (
    <div
      ref={ref}
      className="spatial-stage"
      role="group"
      aria-label="Playback controls"
      data-flat={!spatial || undefined}
      data-orbit={settings.orbit || undefined}
      data-fit={settings.fit === 'auto' ? undefined : settings.fit}
      data-env={settings.env === 'auto' ? undefined : settings.env}
      data-anchor={settings.anchor || undefined}
      data-absolute={settings.absolute || undefined}
    >
      {spatial && <Model part="tray" aria-hidden="true" />}
      {children}
    </div>
  );
}
