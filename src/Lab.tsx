import { useCallback, useEffect, useState, type RefObject } from 'react';

import { Ambient } from './ambient';
import type { LabSettings } from './use-lab-settings';

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

function runChecks() {
  return CHECKS.map((check) => {
    let supported = false;
    try {
      supported = check.test();
    } catch {
      supported = false;
    }
    return { label: check.label, supported };
  });
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
const STARTED = performance.now();

function timestamped(message: string): string {
  const seconds = ((performance.now() - STARTED) / 1000).toFixed(1).padStart(6);
  return `${seconds}s  ${message}`;
}

interface LabProps {
  stageRef: RefObject<HTMLElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  settings: LabSettings;
  onSettingChange: <K extends keyof LabSettings>(name: K, value: LabSettings[K]) => void;
}

export function Lab({ stageRef, videoRef, settings, onSettingChange }: LabProps) {
  const [support] = useState(runChecks);
  const [lines, setLines] = useState(() => [timestamped(navigator.userAgent)]);

  const write = useCallback((message: string) => {
    setLines((previous) => [timestamped(message), ...previous].slice(0, MAX_LINES));
  }, []);

  // Native capture listeners: `load` and `error` don't bubble, and React wires
  // neither for an element it doesn't know, such as <model>.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let lastMove = 0;
    const handleStageEvent = (event: Event) => {
      if (event.type === 'pointermove') {
        const now = performance.now();
        if (now - lastMove < MOVE_INTERVAL) return;
        lastMove = now;
      }

      write(`${event.type} → ${describeTarget(event.target)}${describePointer(event)}`);
    };

    for (const type of LOGGED_EVENTS) stage.addEventListener(type, handleStageEvent, true);
    return () => {
      for (const type of LOGGED_EVENTS) stage.removeEventListener(type, handleStageEvent, true);
    };
  }, [stageRef, write]);

  useEffect(() => {
    const video = videoRef.current;
    if (settings.env !== 'video' || !video) return;

    const ambient = new Ambient(video, write);
    ambient.start();
    return () => ambient.stop();
  }, [settings.env, videoRef, write]);

  const requestVolumetricScene = () => {
    const stage = stageRef.current as (HTMLElement & { requestVolumetricScene?: () => unknown }) | null;

    if (typeof stage?.requestVolumetricScene !== 'function') {
      write('requestVolumetricScene: not a function on this element');
      return;
    }

    try {
      const result = stage.requestVolumetricScene();
      write(`requestVolumetricScene: returned ${describe(result)}`);

      if (result instanceof Promise) {
        result.then(
          (value) => write(`requestVolumetricScene: resolved ${describe(value)}`),
          (error) => write(`requestVolumetricScene: rejected ${String(error)}`)
        );
      }
    } catch (error) {
      write(`requestVolumetricScene: threw ${String(error)}`);
    }
  };

  const copyReport = async () => {
    const report = [
      `settings: ${new URLSearchParams(location.search).toString() || '(defaults)'}`,
      '',
      'support:',
      ...support.map(({ label, supported }) => `${supported ? '✓' : '✗'} ${label}`),
      '',
      'events (newest first):',
      ...lines,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(report);
      write('report copied');
    } catch (error) {
      write(`could not copy (${String(error)})`);
    }
  };

  return (
    <div className="spatial-lab">
      <section>
        <h2>Switches</h2>
        <div className="switches">
          <label>
            <input
              type="checkbox"
              checked={settings.orbit}
              onChange={(event) => onSettingChange('orbit', event.currentTarget.checked)}
            />{' '}
            <code>portal-action: orbit</code>
          </label>
          <label>
            <code>portal-transform</code>
            <select
              value={settings.fit}
              onChange={(event) => onSettingChange('fit', event.currentTarget.value as LabSettings['fit'])}
            >
              <option value="auto">auto (fit the tray)</option>
              <option value="none">none (1cm is 1cm)</option>
              <option value="scale">scale(0.3)</option>
            </select>
          </label>
          <label>
            <code>environment-map</code>
            <select
              value={settings.env}
              onChange={(event) => onSettingChange('env', event.currentTarget.value as LabSettings['env'])}
            >
              <option value="auto">auto (browser default)</option>
              <option value="studio">studio.hdr</option>
              <option value="neon">neon.hdr</option>
              <option value="video">the video itself</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.anchor}
              onChange={(event) => onSettingChange('anchor', event.currentTarget.checked)}
            />{' '}
            Anchor glyphs to the puck (<code>position-anchor</code>)
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.absolute}
              onChange={(event) => onSettingChange('absolute', event.currentTarget.checked)}
            />{' '}
            <code>position: spatial-absolute</code> on models
          </label>
          <button type="button" onClick={requestVolumetricScene}>
            Take the controls out of the page
          </button>
        </div>
      </section>
      <section>
        <h2>Support</h2>
        <table>
          <tbody>
            {support.map(({ label, supported }) => (
              <tr key={label} data-ok={String(supported)}>
                <td>{supported ? '✓' : '✗'}</td>
                <td>{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2>
          Events from the portal{' '}
          <button type="button" onClick={() => void copyReport()}>
            Copy report
          </button>
        </h2>
        <pre aria-live="off">{lines.join('\n')}</pre>
      </section>
    </div>
  );
}

function describeTarget(target: EventTarget | null): string | undefined {
  const element = target instanceof HTMLElement ? target : null;
  const part = element?.dataset.part;
  if (!part) return element?.localName;

  return part === 'tile' ? `${part}[${element.style.getPropertyValue('--i')}]` : part;
}

function describePointer(event: Event): string {
  if (!(event instanceof MouseEvent)) return '';

  const round = (value: number) => (Number.isFinite(value) ? Math.round(value) : String(value));
  let detail =
    ` client=(${round(event.clientX)}, ${round(event.clientY)})` +
    ` offset=(${round(event.offsetX)}, ${round(event.offsetY)})`;
  if (event instanceof PointerEvent) detail += ` ${event.pointerType || 'no pointerType'}`;
  return detail;
}

function describe(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value instanceof Promise) return 'a Promise';
  if (value && typeof value === 'object') return Object.prototype.toString.call(value);
  return JSON.stringify(value);
}
