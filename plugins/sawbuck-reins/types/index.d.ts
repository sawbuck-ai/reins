export type Summary = {
  caught: number
  latest: { kind: string; file: string } | null
  armed: boolean
  active: boolean
  last: string
}

declare module 'claude-code' {
  interface PluginState {
    'sawbuck-reins': { summary: Summary | null }
  }
}
