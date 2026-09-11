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
  hooks: {
    // WXT names an entrypoint by the part of its filename before the first
    // dot, so a colocated `background.test.ts` collides with `background.ts`
    // (both resolve to "background") and fails the build. Drop test files
    // from entrypoint discovery so `foo.ts` -> `foo.test.ts` colocation keeps
    // working inside src/entrypoints/.
    'entrypoints:found': (_wxt, infos) => {
      for (let i = infos.length - 1; i >= 0; i--) {
        if (/\.test\.[jt]sx?$/.test(infos[i]?.inputPath ?? '')) infos.splice(i, 1);
      }
    },
  },
});
