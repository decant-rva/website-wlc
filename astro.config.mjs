import { defineConfig } from 'astro/config';
import { rehypePhotos } from './src/lib/rehype-photos.js';
import { rehypeLayout } from './src/lib/rehype-layout.js';

export default defineConfig({
  site: 'https://www.weddinglightingco.com',
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'never' },
  compressHTML: false,
  markdown: { smartypants: false, rehypePlugins: [rehypePhotos, rehypeLayout] },
});
