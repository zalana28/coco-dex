import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_ENV__: JSON.stringify(process.env.VERCEL_ENV ?? process.env.VITE_PUBLIC_APP_ENV ?? 'local'),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
    __BUILD_TIMESTAMP__: JSON.stringify(process.env.BUILD_TIMESTAMP ?? new Date().toISOString()),
    __GIT_COMMIT_SHA__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'unknown'),
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/,
              priority: 40,
            },
            {
              name: 'wallet-vendor',
              test: /node_modules[\\/](@tanstack|@wagmi|wagmi|viem|abitype|ox)[\\/]/,
              priority: 30,
            },
            {
              name: 'chart-vendor',
              test: /node_modules[\\/](recharts|victory-vendor|d3-[^\\/]+|decimal\.js|decimal\.js-light)[\\/]/,
              priority: 20,
            },
            {
              name: 'ui-vendor',
              test: /node_modules[\\/](lucide-react)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
