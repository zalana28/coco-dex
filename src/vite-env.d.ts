/// <reference types="vite/client" />

declare module '*.css'

declare const __APP_ENV__: string
declare const __APP_VERSION__: string
declare const __BUILD_TIMESTAMP__: string
declare const __GIT_COMMIT_SHA__: string

interface ImportMetaEnv {
  readonly VITE_PUBLIC_APP_ENV?: string
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string
  readonly VITE_ENABLE_XYLONET_EXECUTION?: string
  readonly VITE_ENABLE_UNITFLOW_EXECUTION?: string
  readonly VITE_ENABLE_SYNTHRA_EXECUTION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
