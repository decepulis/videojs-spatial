/*
 * Experiment: light the controls with the video.
 *
 * `@environment-map` takes an image, and the preview accepts equirectangular
 * Radiance HDR files. So: sample the current frame down to a few pixels, wrap
 * it around the sphere, encode it as a tiny .hdr, and point an
 * `@environment-map` named "video" at it. Whether the preview accepts a blob:
 * URL, or re-reads a rule that changes, is exactly what this is here to find out.
 */

const WIDTH = 32;
const HEIGHT = 16;
const INTERVAL = 500;
const GAIN = 4; // push frame colours into HDR range so they read as light
const FLOOR = 0.06; // keep some light on dark frames

export class Ambient {
  readonly #video: HTMLVideoElement;
  readonly #log: (message: string) => void;
  readonly #canvas = document.createElement('canvas');
  readonly #style = document.createElement('style');

  #timer = 0;
  #url: string | null = null;

  constructor(video: HTMLVideoElement, log: (message: string) => void) {
    this.#video = video;
    this.#log = log;
    this.#canvas.width = WIDTH / 2;
    this.#canvas.height = HEIGHT;
  }

  start(): void {
    if (this.#timer) return;

    document.head.append(this.#style);
    this.#timer = window.setInterval(this.#sample, INTERVAL);
    this.#sample();
  }

  stop(): void {
    window.clearInterval(this.#timer);
    this.#timer = 0;
    this.#style.remove();
    this.#revoke();
  }

  #sample = (): void => {
    if (this.#video.readyState < 2) return;

    const context = this.#canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;

    let frame: ImageData;
    try {
      context.drawImage(this.#video, 0, 0, this.#canvas.width, this.#canvas.height);
      frame = context.getImageData(0, 0, this.#canvas.width, this.#canvas.height);
    } catch (error) {
      this.#log(`ambient: cannot read video pixels (${String(error)})`);
      this.stop();
      return;
    }

    const previous = this.#url;
    this.#url = URL.createObjectURL(new Blob([encodeHdr(frame)], { type: 'image/vnd.radiance' }));
    this.#style.textContent = `@environment-map { name: 'video'; format: equirectangular; src: url('${this.#url}'); }`;

    // Give the browser a moment to pick up the new image before dropping the old one.
    if (previous) window.setTimeout(() => URL.revokeObjectURL(previous), INTERVAL * 2);
  };

  #revoke(): void {
    if (this.#url) URL.revokeObjectURL(this.#url);
    this.#url = null;
  }
}

/**
 * Encode a frame as an equirectangular Radiance .hdr (flat RGBE, no run-length
 * encoding). The frame is mirrored so it wraps the full 360° without a seam.
 */
function encodeHdr(frame: ImageData): Uint8Array<ArrayBuffer> {
  const header = new TextEncoder().encode(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${HEIGHT} +X ${WIDTH}\n`);
  const bytes = new Uint8Array(header.length + WIDTH * HEIGHT * 4);
  bytes.set(header);

  let offset = header.length;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const sourceX = x < frame.width ? x : WIDTH - 1 - x;
      const index = (y * frame.width + sourceX) * 4;

      const r = toLinear(frame.data[index]!) * GAIN + FLOOR;
      const g = toLinear(frame.data[index + 1]!) * GAIN + FLOOR;
      const b = toLinear(frame.data[index + 2]!) * GAIN + FLOOR;

      // RGBE: a shared exponent, chosen so the brightest channel fills its byte.
      const exponent = Math.ceil(Math.log2(Math.max(r, g, b)));
      const scale = 256 / 2 ** exponent;
      bytes[offset++] = Math.min(255, r * scale);
      bytes[offset++] = Math.min(255, g * scale);
      bytes[offset++] = Math.min(255, b * scale);
      bytes[offset++] = exponent + 128;
    }
  }

  return bytes;
}

function toLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
