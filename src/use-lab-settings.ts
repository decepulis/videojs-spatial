import { useCallback, useState } from 'react';

/** One spatial feature per switch. Each one becomes a `data-*` attribute on the stage. */
export interface LabSettings {
  orbit: boolean;
  fit: 'auto' | 'none' | 'scale';
  env: 'auto' | 'studio' | 'neon' | 'video';
  anchor: boolean;
  absolute: boolean;
}

/**
 * The lab switches, mirrored to the query string so a setup can be shared.
 * Checkboxes are stored as `1`; defaults are left out. Other parameters, such
 * as `force-spatial`, are kept.
 */
export function useLabSettings() {
  const [settings, setSettings] = useState(readSettings);

  const setSetting = useCallback(<K extends keyof LabSettings>(name: K, value: LabSettings[K]) => {
    setSettings((previous) => ({ ...previous, [name]: value }));

    const params = new URLSearchParams(location.search);
    const stored = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
    if (stored === '0' || stored === 'auto') params.delete(name);
    else params.set(name, stored);
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
  }, []);

  return [settings, setSetting] as const;
}

function readSettings(): LabSettings {
  const params = new URLSearchParams(location.search);

  return {
    orbit: params.get('orbit') === '1',
    fit: (params.get('fit') ?? 'auto') as LabSettings['fit'],
    env: (params.get('env') ?? 'auto') as LabSettings['env'],
    anchor: params.get('anchor') === '1',
    absolute: params.get('absolute') === '1',
  };
}
