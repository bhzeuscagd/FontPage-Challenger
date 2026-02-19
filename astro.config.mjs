// @ts-check
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()]
  },
  // Ensure we are in SSR mode if needed for auth, but for now mostly static/hybrid
  output: 'server'
})
