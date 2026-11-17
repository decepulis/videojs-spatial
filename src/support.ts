/**
 * Whether to render models in a portal or flat HTML controls. `?force-spatial`
 * renders the models anyway, to exercise their wiring in a browser without portals.
 */
export const SPATIAL = CSS.supports('spatial', 'portal') || new URLSearchParams(location.search).has('force-spatial');
