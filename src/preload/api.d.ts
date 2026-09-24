import type { SnapmarkApi } from '../shared/ipc'

declare global {
  interface Window {
    snapmark: SnapmarkApi
  }
}

export {}
