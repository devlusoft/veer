import { defineConfig } from '@devlusoft/veer/config'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  runtimeConfig: {
    apiSecret: 'default-secret',
    public: {
      apiBase: '/api',
    },
  },
  vite: {
    plugins: [
      tailwindcss(),
    ],
  },
})
