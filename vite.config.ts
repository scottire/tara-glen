import { defineConfig } from 'vite';
export default defineConfig({ base: '/tara-glen/', define: { __BUILD__: JSON.stringify(Date.now().toString(36)) }, build: { chunkSizeWarningLimit: 2000 } });
