import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

function swPrecache() {
  return {
    name: 'sw-precache',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve(process.cwd(), 'dist');
      const files = [];
      function walk(dir, base) {
        for (const name of fs.readdirSync(dir)) {
          const full = path.join(dir, name);
          const stat = fs.statSync(full);
          if (stat.isDirectory()) walk(full, base);
          else {
            const rel = path.relative(base, full).split(path.sep).join('/');
            files.push('./' + rel);
          }
        }
      }
      walk(dist, dist);
      const manifest = JSON.stringify(files);
      const swPath = path.join(dist, 'sw.js');
      if (fs.existsSync(swPath)) {
        const content = fs.readFileSync(swPath, 'utf8');
        fs.writeFileSync(swPath, `self.__PRECACHE_MANIFEST = ${manifest};\n` + content);
      }
    },
  };
}

export default defineConfig({
  base: '/',
  publicDir: 'public',
  plugins: [vue(), tailwindcss(), swPrecache()],
});