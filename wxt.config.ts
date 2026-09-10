import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Smart Bookmark Cleaner',
    description: 'Find duplicate, dead, and untagged bookmarks — safely.',
    permissions: ['bookmarks', 'storage'],
  },
});
