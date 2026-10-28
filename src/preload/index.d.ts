import type { BrainAPI } from '../shared/api'

declare global {
  interface Window {
    api: BrainAPI
  }
}

export {}
