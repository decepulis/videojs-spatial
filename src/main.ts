import './player';

import '@videojs/html/ui/container';
import '@videojs/html/ui/hotkey';
import '@videojs/html/ui/time';

import { SpatialLabElement } from './lab';
import { SpatialPlayButtonElement } from './spatial-play-button';
import { SpatialStageElement } from './spatial-stage';
import { SpatialTimeSliderElement } from './spatial-time-slider';

customElements.define(SpatialStageElement.tagName, SpatialStageElement);
customElements.define(SpatialPlayButtonElement.tagName, SpatialPlayButtonElement);
customElements.define(SpatialTimeSliderElement.tagName, SpatialTimeSliderElement);
customElements.define(SpatialLabElement.tagName, SpatialLabElement);
