import { extname } from 'node:path';
import { defineConfig, type Connect, type Plugin } from 'vite';

// Safari wants real media types for <model> sources and HDR images.
const MEDIA_TYPES: Record<string, string> = {
  '.usdz': 'model/vnd.usdz+zip',
  '.hdr': 'image/vnd.radiance',
};

const setMediaTypes: Connect.NextHandleFunction = (req, res, next) => {
  const type = MEDIA_TYPES[extname((req.url ?? '').split('?')[0]!)];
  if (type) res.setHeader('Content-Type', type);
  next();
};

function mediaTypes(): Plugin {
  return {
    name: 'spatial-media-types',
    configureServer: (server) => void server.middlewares.use(setMediaTypes),
    configurePreviewServer: (server) => void server.middlewares.use(setMediaTypes),
  };
}

export default defineConfig({
  // Relative URLs so the build works from any path (GitHub Pages, a subfolder, …).
  base: './',
  plugins: [mediaTypes()],
});
