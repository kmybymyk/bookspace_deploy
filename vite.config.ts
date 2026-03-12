import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('/@tiptap/') || id.includes('/prosemirror-')) return 'vendor-tiptap'
          if (id.includes('/@dnd-kit/')) return 'vendor-dnd'
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'vendor-react'
          if (id.includes('/i18next/') || id.includes('/react-i18next/')) return 'vendor-i18n'
          if (id.includes('/jszip/')) return 'vendor-jszip'
          return 'vendor-misc'
        },
      },
    },
  },
  base: './',
})
