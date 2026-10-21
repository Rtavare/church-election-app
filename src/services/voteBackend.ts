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
export interface SimpleDept {
  id: string
  name: string
  candidates: { id: string; name: string }[] // number = order added (index + 1)
  suggestions: string[] // names submitted from phones, waiting for pastor/secretary to add
}
/** Kahoot-style simple session: one department at a time. */
export interface SessionBallotDef {
  departments: SimpleDept[]
  current: number // index of the department on screen
  phase: SessionPhase
}
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

/** A voter submits a name from their phone; pastor/secretary decides whether to add it. */
export async function submitSuggestion(code: string, name: string): Promise<void> {
  const session = await getSession(code)
  if (!session) return
  const dept = session.ballot.departments[session.ballot.current]
  if (!dept || session.ballot.phase !== 'names') return
  dept.suggestions = [...(dept.suggestions || []), name]
  await updateSession(session)
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
