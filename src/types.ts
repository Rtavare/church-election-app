export type Lang = 'en' | 'es'
export type Consent = 'not-asked' | 'asked' | 'agreed' | 'declined'
export type Stage =
  | 'setup' | 'nominating' | 'consent' | 'report' | 'voting' | 'certification' | 'done'

export interface Nominee { id: string; name: string; consent: Consent }
export interface Office {
  id: string
  departmentId: string
  department: string // display name as entered / chosen
  role: string
  slots: number
  nominees: Nominee[]
}
export interface Election {
  id: string
  title: string
  church: string
  termYears: 1 | 2
  chair: string // usually the pastor
  secretary: string
}
/** Anonymous by design: a ballot has NO voter field of any kind. */
export interface Ballot {
  id: string
  castAt: string
  choices: Record<string, string | null> // officeId -> nomineeId | null (abstain)
}
export interface AppState {
  lang: Lang
  election: Election | null
  stage: Stage
  committee: string[]
  offices: Office[]
  votingOpen: boolean
  ballots: Ballot[]
}
