// Vote session backend.
//
// Two modes:
// 1. LIVE (Supabase configured via VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY):
//    chair creates a session row, voters on other phones fetch it and insert
//    anonymous ballots, chair polls ballots back. See supabase/schema.sql.
// 2. LOCAL DEMO (no env configured): sessions + ballots live in localStorage
//    and sync across tabs/windows of the same browser via BroadcastChannel.
//    Good for testing the flow on one device; NOT a multi-phone backend.
//
// Anonymity: a ballot payload is { sessionCode, choices } only.
// There is deliberately no voter field anywhere in this layer.

export type SessionPhase = 'names' | 'voting' | 'results' | 'done'
export interface OfficialSnap { name: string; number: number; votes: number }
export interface ApprovedResult { director?: OfficialSnap; sub?: OfficialSnap; approvedAt: string }
export interface SimpleDept {
  id: string
  name: string
  candidates: { id: string; name: string }[] // number = order added (index + 1)
  suggestions: string[] // names submitted from phones, waiting for pastor/secretary to add
  approved?: ApprovedResult | null // set when the committee's vote is submitted as approved
}
/** Kahoot-style simple session: one department at a time. */
export interface SessionBallotDef {
  departments: SimpleDept[]
  current: number // index of the department on screen
  phase: SessionPhase
  allowSuggestions?: boolean // president's switch: may the committee submit names from phones? (default true)
  sessionId?: string // unique, permanent ID for this session (separate from the join PIN)
  hostPin?: string // pastor/president ONLY: pairs with sessionId for restore + dashboard. Never the committee voting PIN.
}

/** Name comparison for duplicate checks: ignores case, extra spaces and accents. */
export const normalizeName = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

export type SuggestResult = 'added' | 'duplicate' | 'off' | 'unavailable'
export interface VoteSession {
  code: string
  title: string
  church: string
  lang: 'en' | 'es'
  open: boolean
  ballot: SessionBallotDef
  createdAt: string
}
export interface RemoteBallot { choices: Record<string, string | null>; castAt: string }

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const isLiveBackend = Boolean(SUPABASE_URL && SUPABASE_KEY)

const headers = () => ({
  apikey: SUPABASE_KEY || '',
  Authorization: `Bearer ${SUPABASE_KEY || ''}`,
  'Content-Type': 'application/json',
})

async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers(), ...(init.headers || {}) } })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// ---- local demo store ----
const LS_SESSIONS = 'church-election-sessions-v1'
const LS_BALLOTS = 'church-election-remote-ballots-v1'
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('church-election') : null
const readLS = <T,>(k: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(k) || '') as T } catch { return fallback } }
const writeLS = (k: string, v: unknown) => { localStorage.setItem(k, JSON.stringify(v)); channel?.postMessage({ key: k }) }
export const onLocalSync = (fn: () => void) => { channel?.addEventListener('message', fn); window.addEventListener('storage', fn) }

export function newSessionCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function createSession(session: VoteSession): Promise<void> {
  if (isLiveBackend) {
    await sb('vote_sessions', { method: 'POST', body: JSON.stringify({
      code: session.code, title: session.title, church: session.church,
      lang: session.lang, open: session.open, ballot: session.ballot }) })
    return
  }
  const all = readLS<Record<string, VoteSession>>(LS_SESSIONS, {})
  all[session.code] = session
  writeLS(LS_SESSIONS, all)
}

export async function getSession(code: string): Promise<VoteSession | null> {
  if (isLiveBackend) {
    const rows = await sb(`vote_sessions?code=eq.${encodeURIComponent(code)}&select=*`)
    return rows?.[0] ?? null
  }
  return readLS<Record<string, VoteSession>>(LS_SESSIONS, {})[code] ?? null
}

export async function updateSession(session: VoteSession): Promise<void> {
  if (isLiveBackend) {
    await sb(`vote_sessions?code=eq.${encodeURIComponent(session.code)}`, { method: 'PATCH',
      body: JSON.stringify({ ballot: session.ballot, open: session.open, lang: session.lang }) })
    return
  }
  const all = readLS<Record<string, VoteSession>>(LS_SESSIONS, {})
  all[session.code] = session
  writeLS(LS_SESSIONS, all)
}

/** A voter submits a name from their phone; pastor/secretary decides whether to add it.
 *  Returns 'duplicate' when the name is already on the official list or already waiting,
 *  and 'off' when the president has turned phone submissions off. */
export async function submitSuggestion(code: string, name: string): Promise<SuggestResult> {
  const session = await getSession(code)
  if (!session) return 'unavailable'
  const dept = session.ballot.departments[session.ballot.current]
  if (!dept || session.ballot.phase !== 'names') return 'unavailable'
  if (session.ballot.allowSuggestions === false) return 'off'
  const n = normalizeName(name)
  if (!n) return 'unavailable'
  const dup = dept.candidates.some(c => normalizeName(c.name) === n) ||
    (dept.suggestions || []).some(sg => normalizeName(sg) === n)
  if (dup) return 'duplicate'
  dept.suggestions = [...(dept.suggestions || []), name.trim()]
  await updateSession(session)
  return 'added'
}

/** Move already-cast ballots from one session code to another (used when the PIN changes). */
export async function moveBallots(fromCode: string, toCode: string): Promise<void> {
  if (isLiveBackend) {
    await sb(`vote_ballots?session_code=eq.${encodeURIComponent(fromCode)}`, { method: 'PATCH', body: JSON.stringify({ session_code: toCode }) }).catch(() => {})
    return
  }
  const all = readLS<Record<string, RemoteBallot[]>>(LS_BALLOTS, {})
  if (all[fromCode]?.length) { all[toCode] = [...(all[toCode] || []), ...all[fromCode]]; delete all[fromCode]; writeLS(LS_BALLOTS, all) }
}

export async function deleteSession(code: string): Promise<void> {
  if (isLiveBackend) {
    // Best effort: delete the row; if RLS blocks it, closing the session still kills the PIN.
    await sb(`vote_sessions?code=eq.${encodeURIComponent(code)}`, { method: 'DELETE' }).catch(() => {})
    await sb(`vote_sessions?code=eq.${encodeURIComponent(code)}`, { method: 'PATCH', body: JSON.stringify({ open: false }) }).catch(() => {})
    return
  }
  const all = readLS<Record<string, VoteSession>>(LS_SESSIONS, {})
  delete all[code]
  writeLS(LS_SESSIONS, all)
}

export async function setSessionOpen(code: string, open: boolean): Promise<void> {
  if (isLiveBackend) {
    await sb(`vote_sessions?code=eq.${encodeURIComponent(code)}`, { method: 'PATCH', body: JSON.stringify({ open }) })
    return
  }
  const all = readLS<Record<string, VoteSession>>(LS_SESSIONS, {})
  if (all[code]) { all[code].open = open; writeLS(LS_SESSIONS, all) }
}

/** Submit an anonymous ballot. Payload has no voter identity by design. */
export async function submitBallot(code: string, choices: Record<string, string | null>): Promise<void> {
  const ballot: RemoteBallot = { choices, castAt: new Date().toISOString() }
  if (isLiveBackend) {
    await sb('vote_ballots', { method: 'POST', body: JSON.stringify({ session_code: code, choices: ballot.choices }) })
    return
  }
  const all = readLS<Record<string, RemoteBallot[]>>(LS_BALLOTS, {})
  ;(all[code] ||= []).push(ballot)
  writeLS(LS_BALLOTS, all)
}

export async function fetchBallots(code: string): Promise<RemoteBallot[]> {
  if (isLiveBackend) {
    const rows = await sb(`vote_ballots?session_code=eq.${encodeURIComponent(code)}&select=choices,cast_at&order=cast_at.asc`)
    return (rows || []).map((r: { choices: Record<string, string | null>; cast_at: string }) => ({ choices: r.choices, castAt: r.cast_at }))
  }
  return readLS<Record<string, RemoteBallot[]>>(LS_BALLOTS, {})[code] || []
}

/** One vote per device per session — enforced on the voter's device, not by identity. */
export const votedKey = (code: string) => `church-election-voted-${code}`
export const publicBaseUrl = (): string => {
  const configured = import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined
  if (configured) return configured.replace(/\/$/, '')
  return `${window.location.origin}${window.location.pathname}`
}
export const joinUrl = (code: string) => `${publicBaseUrl()}#/vote/${code}`
export const dashboardUrl = (sessionId: string, hostPin: string) => `${publicBaseUrl()}#/dashboard/${sessionId}/${hostPin}`

/** Find a session by its Session ID (used by restore + dashboard, where the voting PIN is not the credential). */
export async function getSessionById(sessionId: string): Promise<VoteSession | null> {
  const id = sessionId.trim().toLowerCase()
  if (!id) return null
  if (isLiveBackend) {
    // NOTE: the ->> JSON operator must stay URL-encoded (%3E) or PostgREST returns nothing.
    const rows = await sb(`vote_sessions?ballot-%3E%3EsessionId=eq.${encodeURIComponent(id)}&select=*`)
    return rows?.[0] ?? null
  }
  const all = readLS<Record<string, VoteSession>>(LS_SESSIONS, {})
  return Object.values(all).find(s => (s.ballot.sessionId || '').toLowerCase() === id) || null
}

/** Host credential check: host PIN, or (legacy sessions without one) the voting PIN. */
export const hostPinMatches = (session: VoteSession, pin: string) =>
  session.ballot.hostPin ? pin === session.ballot.hostPin : pin === session.code
export const dashboardEntryUrl = () => `${publicBaseUrl()}#/dashboard`
