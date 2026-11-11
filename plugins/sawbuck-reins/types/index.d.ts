export type Summary = {
  caught: number
  latest: { kind: string; file: string; base?: string } | null
  armed: boolean
  active: boolean
  mem: boolean
  last: string
  signed: boolean
  repeat: string   // the steer you keep repeating, when there is one
  repo: string   // the detected repository's folder name
  noRepo: boolean   // not in a git repository: the band says so and nothing is gathered
  steer: number | null   // live steering gauge 0-100: an EMA over roughly the last 20 scored turns (lifetime rate for older steer.json), or null if unknown
}

declare module 'claude-code' {
  interface PluginState {
    'sawbuck-reins': { summary: Summary | null }
  }
}
