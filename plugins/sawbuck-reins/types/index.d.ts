export type Summary = {
  caught: number
  latest: { kind: string; file: string } | null
  armed: boolean
  active: boolean
  mem: boolean
  last: string
  steer: number | null   // live steering gauge 0-100: an EMA over roughly the last 20 scored turns (lifetime rate for older steer.json), or null if unknown
}

declare module 'claude-code' {
  interface PluginState {
    'sawbuck-reins': { summary: Summary | null }
  }
}
