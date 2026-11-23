import { picture } from './photos.js';

// Markdown refers to photos as ![alt](wix:PHOTO_ID). This turns each one into
// a <picture> with AVIF and WebP sources, explicit dimensions and lazy loading.
// The first photo on a page loads eagerly because it is usually above the fold.
export function rehypePhotos() {
  return (tree) => {
    let first = true;
    const visit = (node) => {
      if (!node.children) return;
      node.children = node.children.map((child) => {
        if (child.type === 'element' && child.tagName === 'img' && String(child.properties?.src || '').startsWith('wix:')) {
          const id = decodeURIComponent(child.properties.src.slice(4));
          const p = picture(id);
          const alt = child.properties.alt || '';
          if (!p) return { type: 'comment', value: ` photo not processed yet: ${id} ` };
          const eager = first;
          first = false;
          const img = {
            type: 'element', tagName: 'img', children: [],
            properties: {
              src: p.single || p.fallback, alt, width: p.width, height: p.height,
              loading: eager ? 'eager' : 'lazy', decoding: 'async',
              ...(eager ? { fetchpriority: 'high' } : {}),
            },
          };
          if (p.single) return img;
          const source = (type, set) => ({
            type: 'element', tagName: 'source', children: [],
            properties: { type, srcset: set, sizes: p.sizes },
          });
          return {
            type: 'element', tagName: 'picture', properties: {},
            children: [source('image/avif', p.avif), source('image/webp', p.webp), img],
          };
        }
        visit(child);
        return child;
      });
    };
    visit(tree);
  };
}
