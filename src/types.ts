export type Lang = 'en' | 'es'
export type Consent = 'not-asked' | 'asked' | 'agreed' | 'declined'
export type Stage =
  | 'setup' | 'departments' | 'candidates' | 'assignments' | 'consent' | 'report' | 'voting' | 'certification' | 'done'

export interface Candidate {
  id: string
  name: string
  consent: Consent
}
/** A role inside a department, e.g. Director, Sub-Director, Secretary. */
export interface Position {
  id: string
  title: string
  candidateId: string | null // assigned candidate, from this department's pool
}
/** Process v2: department first, then its candidate pool, then role assignments. */
export interface Department {
  id: string
  presetId: string
  customName: string // used only when presetId === 'custom'
  activeNextYear: boolean
  candidates: Candidate[]
  positions: Position[]
}
export interface Election {
  id: string
  title: string
  church: string
  termYears: 1 | 2
  chair: string
  secretary: string
}
/** Anonymous by design: a ballot has NO voter field of any kind.
 *  Choices are keyed by Position.id, valued by Candidate.id (or null = abstain). */
export interface Ballot {
  id: string
  castAt: string
  choices: Record<string, string | null>
}
export interface AppState {
  lang: Lang
  election: Election | null
  stage: Stage
  committee: string[]
  departments: Department[]
  votingOpen: boolean
  ballots: Ballot[]
}
