declare global {
  namespace NodeJS {
    interface ProcessEnv {
      ASSET_BASE_URL?: string
    }
  }
}

export {}
