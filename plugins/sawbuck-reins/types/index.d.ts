export type Summary = {
  caught: number
  latest: { kind: string; file: string } | null
  armed: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'sawbuck-reins': { summary: Summary | null }
  }
}
