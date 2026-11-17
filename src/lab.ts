import { Ambient } from './ambient';

/*
 * The lab: everything needed to find out what the preview really does.
 *
 *  - Support: which parts of the draft spec this browser parses.
 *  - Switches: one spatial feature each, mirrored to the URL so a setup can be shared.
 *  - Events: what a model in a portal reports to the page.
 */

interface Check {
  label: string;
  test: () => boolean;
}

const css = (property: string, value: string): Check => ({
  label: `${property}: ${value}`,
  test: () => CSS.supports(property, value),
});

const CHECKS: Check[] = [
  { label: '<model> element (HTMLModelElement)', test: () => 'HTMLModelElement' in window },
  css('spatial', 'portal'),
  css('spatial', 'page'),
  css('transform', 'translateX(50cm)'),
  css('portal-action', 'orbit'),
  css('portal-action', 'pan'),
  css('portal-transform', 'none'),
  css('portal-stage', 'auto'),
  css('position', 'spatial-absolute'),
  css('inset-back', '1cm'),
  css('front-limit', '1cm'),
  { label: '@media (front-limit >= 0cm)', test: () => matchMedia('(front-limit >= 0cm)').matches },
  css('anchor-name', '--a'),
  css('position-anchor', '--a'),
  css('position-context', 'anchor'),
  css('environment-map', '"studio"'),
  css('environment-intensity', '2'),
  css('environment-rotate', '45deg'),
  { label: '@environment-map rule', test: parsesEnvironmentMapRule },
  { label: 'element.requestVolumetricScene()', test: () => 'requestVolumetricScene' in HTMLElement.prototype },
];

function parsesEnvironmentMapRule(): boolean {
  const style = document.createElement('style');
  style.textContent = '@environment-map { name: "probe"; }';
  document.head.append(style);
  const parsed = (style.sheet?.cssRules.length ?? 0) > 0;
  style.remove();
  return parsed;
}

const LOGGED_EVENTS = [
  'click',
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
  'gesturestart',
  'gesturechange',
  'gestureend',
  'load',
  'error',
] as const;

const MAX_LINES = 80;
const MOVE_INTERVAL = 250;

export class SpatialLabElement extends HTMLElement {
  static readonly tagName = 'spatial-lab';

  readonly #settings = new URLSearchParams(location.search);
  readonly #lines: string[] = [];
  readonly #hoisted = new Map<Element, Element>();
  readonly #started = performance.now();

  #stage: HTMLElement | null = null;
  #ambient: Ambient | null = null;
  #log: HTMLElement | null = null;
  #lastMove = 0;
  #connected = false;

  connectedCallback(): void {
    if (this.#connected) return;
    this.#connected = true;

    this.#stage = document.querySelector('spatial-stage');
    const video = document.querySelector('video');
    if (video) this.#ambient = new Ambient(video, this.#write);

    this.innerHTML = `
      <section>
        <h2>Switches</h2>
        <div class="switches">
          <label><input type="checkbox" name="orbit" /> <code>portal-action: orbit</code></label>
          <label>
            <code>portal-transform</code>
            <select name="fit">
              <option value="auto">auto (fit the tray)</option>
              <option value="none">none (1cm is 1cm)</option>
              <option value="scale">scale(0.3)</option>
            </select>
          </label>
          <label>
            <code>environment-map</code>
            <select name="env">
              <option value="auto">auto (browser default)</option>
              <option value="studio">studio.hdr</option>
              <option value="neon">neon.hdr</option>
              <option value="video">the video itself</option>
            </select>
          </label>
          <label><input type="checkbox" name="anchor" /> Anchor glyphs to the puck (<code>position-anchor</code>)</label>
          <label><input type="checkbox" name="absolute" /> <code>position: spatial-absolute</code> on models</label>
          <label><input type="checkbox" name="hoist" /> Hoist models to direct children of the portal</label>
          <button type="button" data-action="volumetric">Take the controls out of the page</button>
        </div>
        <p class="hint">
          If the tray shows but the buttons don't, try “Hoist models” first: by default each control wraps its models in
          its own element, and the preview may only place a portal's direct children.
        </p>
      </section>
      <section>
        <h2>Support</h2>
        <table><tbody></tbody></table>
      </section>
      <section>
        <h2>Events from the portal <button type="button" data-action="copy">Copy report</button></h2>
        <pre aria-live="off"></pre>
      </section>
    `;

    this.#log = this.querySelector('pre');
    this.#renderSupport();
    this.#restore();

    this.addEventListener('change', this.#handleChange);
    this.addEventListener('click', this.#handleClick);

    for (const type of LOGGED_EVENTS) {
      // Capture, so events that do not bubble (load, error) are seen too.
      this.#stage?.addEventListener(type, this.#handleStageEvent, true);
    }

    this.#write(navigator.userAgent);
  }

  #renderSupport(): void {
    const body = this.querySelector('tbody')!;

    for (const check of CHECKS) {
      let supported = false;
      try {
        supported = check.test();
      } catch {
        supported = false;
      }

      const row = body.insertRow();
      row.dataset.ok = String(supported);
      row.insertCell().textContent = supported ? '✓' : '✗';
      row.insertCell().textContent = check.label;
    }
  }

  #restore(): void {
    for (const control of this.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[name]')) {
      const value = this.#settings.get(control.name);
      if (value === null) continue;

      if (control instanceof HTMLInputElement) control.checked = value === '1';
      else control.value = value;
      this.#apply(control.name, value);
    }
  }

  #handleChange = (event: Event): void => {
    const control = event.target;
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement) || !control.name) return;

    const value = control instanceof HTMLInputElement ? (control.checked ? '1' : '0') : control.value;
    const isDefault = value === '0' || value === 'auto';

    if (isDefault) this.#settings.delete(control.name);
    else this.#settings.set(control.name, value);
    history.replaceState(null, '', `${location.pathname}${this.#settings.size ? `?${this.#settings}` : ''}`);

    this.#apply(control.name, value);
  };

  #apply(name: string, value: string): void {
    const stage = this.#stage;
    if (!stage) return;

    switch (name) {
      case 'orbit':
      case 'anchor':
      case 'absolute':
        stage.toggleAttribute(`data-${name}`, value === '1');
        break;

      case 'fit':
      case 'env':
        if (value === 'auto') stage.removeAttribute(`data-${name}`);
        else stage.setAttribute(`data-${name}`, value);

        if (name === 'env' && value === 'video') this.#ambient?.start();
        else if (name === 'env') this.#ambient?.stop();
        break;

      case 'hoist':
        this.#hoist(value === '1');
        break;
    }
  }

  /** Move every model up to the portal itself, or put them back in their controls. */
  #hoist(on: boolean): void {
    const stage = this.#stage;
    if (!stage) return;

    if (on) {
      for (const model of stage.querySelectorAll('model')) {
        const parent = model.parentElement;
        if (!parent || parent === stage) continue;

        this.#hoisted.set(model, parent);
        stage.append(model);
      }
    } else {
      for (const [model, parent] of this.#hoisted) parent.append(model);
      this.#hoisted.clear();
    }
  }

  #handleClick = (event: Event): void => {
    const action = (event.target as Element).closest<HTMLElement>('[data-action]')?.dataset.action;

    if (action === 'volumetric') this.#requestVolumetricScene();
    else if (action === 'copy') void this.#copyReport();
  };

  #requestVolumetricScene(): void {
    const stage = this.#stage as (HTMLElement & { requestVolumetricScene?: () => unknown }) | null;

    if (typeof stage?.requestVolumetricScene !== 'function') {
      this.#write('requestVolumetricScene: not a function on this element');
      return;
    }

    try {
      const result = stage.requestVolumetricScene();
      this.#write(`requestVolumetricScene: returned ${describe(result)}`);

      if (result instanceof Promise) {
        result.then(
          (value) => this.#write(`requestVolumetricScene: resolved ${describe(value)}`),
          (error) => this.#write(`requestVolumetricScene: rejected ${String(error)}`)
        );
      }
    } catch (error) {
      this.#write(`requestVolumetricScene: threw ${String(error)}`);
    }
  }

  async #copyReport(): Promise<void> {
    const support = [...this.querySelectorAll('tbody tr')].map((row) => row.textContent?.replace(/\s+/g, ' ').trim());
    const report = [
      `settings: ${this.#settings.toString() || '(defaults)'}`,
      '',
      'support:',
      ...support,
      '',
      'events (newest first):',
      ...this.#lines,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(report);
      this.#write('report copied');
    } catch (error) {
      this.#write(`could not copy (${String(error)})`);
    }
  }

  #handleStageEvent = (event: Event): void => {
    if (event.type === 'pointermove') {
      const now = performance.now();
      if (now - this.#lastMove < MOVE_INTERVAL) return;
      this.#lastMove = now;
    }

    const target = event.target instanceof HTMLElement ? event.target : null;
    const part = target?.dataset.part;
    const name = part ? `${part}${part === 'tile' ? `[${target.style.getPropertyValue('--i')}]` : ''}` : target?.localName;

    let detail = '';
    if (event instanceof MouseEvent) {
      const round = (value: number) => (Number.isFinite(value) ? Math.round(value) : String(value));
      detail =
        ` client=(${round(event.clientX)}, ${round(event.clientY)})` +
        ` offset=(${round(event.offsetX)}, ${round(event.offsetY)})`;
      if (event instanceof PointerEvent) detail += ` ${event.pointerType || 'no pointerType'}`;
    }

    this.#write(`${event.type} → ${name}${detail}`);
  };

  #write = (message: string): void => {
    const seconds = ((performance.now() - this.#started) / 1000).toFixed(1).padStart(6);

    this.#lines.unshift(`${seconds}s  ${message}`);
    this.#lines.length = Math.min(this.#lines.length, MAX_LINES);
    if (this.#log) this.#log.textContent = this.#lines.join('\n');
  };
}

function describe(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value instanceof Promise) return 'a Promise';
  if (value && typeof value === 'object') return Object.prototype.toString.call(value);
  return JSON.stringify(value);
}
