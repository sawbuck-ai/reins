export type Summary = {
  caught: number
  latest: { kind: string; file: string } | null
  armed: boolean
  active: boolean
  mem: boolean
  last: string
  steer: number | null   // live steering rate 0-100 (% of turns steered this session), or null if unknown
}

declare module 'claude-code' {
  interface PluginState {
    'sawbuck-reins': { summary: Summary | null }
  }
}
