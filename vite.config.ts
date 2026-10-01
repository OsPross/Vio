import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('motion') || id.includes('framer-motion')) return 'motion';
            if (id.includes('lucide-react')) return 'icons';
            if (id.includes('@dnd-kit')) return 'dnd';
            if (id.includes('react-dom') || id.includes('/react/') || id.endsWith('\\react\\index.js'))
              return 'react';
            // zustand stays with app/vendor default to avoid react↔vendor cycles
            return;
          }
          // Heavy guest webview module — keep initial index near PERF-2 ~250 kB
          const norm = id.replace(/\\/g, '/');
          if (norm.includes('/src/features/tabs/TabWebview')) return 'feat-tab-webview';
        },
      },
    },
  },
});
