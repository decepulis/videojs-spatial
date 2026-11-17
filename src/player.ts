import { createPlayer } from '@videojs/html';
import { videoFeatures } from '@videojs/html/video';

export const { PlayerElement, PlayerController } = createPlayer({ features: videoFeatures });

// Registered here, before any control is imported, so controls find their player when they upgrade.
customElements.define('video-player', PlayerElement);
