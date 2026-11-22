import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Every public URL is one Markdown file. The front matter carries the page's
// metadata exactly as it should appear in the HTML head.
const entry = z.object({
  path: z.string().startsWith('/'),
  template: z.enum(['home', 'page', 'legal', 'post', 'product', 'catalog', 'store-category',
    'blog-index', 'blog-category', 'blog-tag', 'profile']),
  title: z.string(),
  description: z.string(),
  canonical: z.string().url(),
  robots: z.string(),
  h1: z.array(z.string()),
  og: z.record(z.string(), z.string()),
  schema: z.record(z.string(), z.any()).optional(),
  items: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

const collection = (dir: string) =>
  defineCollection({ loader: glob({ pattern: '*.md', base: `./content/${dir}` }), schema: entry });

export const collections = {
  pages: collection('pages'),
  posts: collection('posts'),
  products: collection('products'),
};
