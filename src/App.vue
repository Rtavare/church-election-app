<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { DEPARTMENTS } from './data/departments'
import { createSession, deleteSession, fetchBallots, moveBallots, normalizeName, getSession, isLiveBackend, joinUrl, newSessionCode, updateSession, type RemoteBallot, type SimpleDept, type VoteSession } from './services/voteBackend'
import type { Lang } from './types'

// ——— Kahoot-style simple flow ———
// Host: pick departments → show ONE department → names are submitted →
// pastor/secretary adds each name to the list (number = order added) →
// committee scans the QR and votes by number → results → next department.
const KEY = 'church-election-simple-v1'
interface HostState { lang: Lang; code: string | null; title: string; church: string }
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '') as HostState } catch { return null } })()
const lang = ref<Lang>(saved?.lang || 'en')
const es = computed(() => lang.value === 'es')
const L = (en: string, esTxt: string) => (es.value ? esTxt : en)
const setLang = (l: Lang) => { lang.value = l; persist() }
function persist() { localStorage.setItem(KEY, JSON.stringify({ lang: lang.value, code: session.value?.code || null, title: title.value, church: church.value })) }

const title = ref(saved?.title || '')
const church = ref(saved?.church || '')
const session = ref<VoteSession | null>(null)
const ballots = ref<RemoteBallot[]>([])
const qrDataUrl = ref('')
const nameDraft = ref('')
let poll: number | undefined

const qrJoinUrl = () => (session.value ? joinUrl(session.value.code) : '#')
const sessionId = computed(() => session.value?.ballot.sessionId || '')
const sessionIdShort = computed(() => sessionId.value ? sessionId.value.slice(0, 8).toUpperCase() : '—')
const dept = computed<SimpleDept | null>(() => session.value?.ballot.departments[session.value.ballot.current] || null)
const phase = computed(() => session.value?.ballot.phase || 'names')
const isDone = computed(() => (phase.value as string) === 'done')
const totalDepts = computed(() => session.value?.ballot.departments.length || 0)

// setup: department picker
const setupDepts = reactive<{ presetId: string; name: string }[]>([])
const presetId = ref(DEPARTMENTS[0].id)
const customName = ref('')
const availablePresets = computed(() => DEPARTMENTS.filter(p => p.id === 'custom' || !setupDepts.some(d => d.presetId === p.id)))
function addSetupDept() {
  const p = DEPARTMENTS.find(x => x.id === presetId.value)
  if (!p) return
  const name = p.id === 'custom' ? customName.value.trim() : (es.value ? p.es : p.en)
  if (!name) return
  setupDepts.push({ presetId: p.id, name })
  customName.value = ''
}
function removeSetupDept(i: number) { setupDepts.splice(i, 1) }

const pin = ref('')
const pinError = ref('')
const validPin = (v: string) => /^\d{6}$/.test(v.trim())
async function startSession() {
  if (!setupDepts.length) return
  pinError.value = ''
  const code = pin.value.trim()
  if (!validPin(code)) { pinError.value = L('PIN must be exactly 6 digits.', 'El PIN debe tener exactamente 6 dígitos.'); return }
  const existing = await getSession(code).catch(() => null)
  if (existing && existing.ballot.phase !== 'done') { pinError.value = L('That PIN is already in use — pick another.', 'Ese PIN ya está en uso — elija otro.'); return }
  const s: VoteSession = {
    code, title: title.value.trim() || L('Church Election', 'Elección de la Iglesia'), church: church.value.trim(),
    lang: lang.value, open: true, createdAt: new Date().toISOString(),
    ballot: { departments: setupDepts.map(d => ({ id: crypto.randomUUID(), name: d.name, candidates: [], suggestions: [] })), current: 0, phase: 'names', allowSuggestions: true, sessionId: crypto.randomUUID() },
  }
  await createSession(s)
  session.value = s
  qrDataUrl.value = await QRCode.toDataURL(joinUrl(code), { width: 300 })
  persist()
  startPolling()
}
async function sync(patch?: Partial<VoteSession['ballot']>) {
  if (!session.value) return
  if (patch) session.value.ballot = { ...session.value.ballot, ...patch }
  await updateSession(session.value)
  session.value = { ...session.value }
}
async function refresh() {
  if (!session.value) return
  const fresh = await getSession(session.value.code).catch(() => null)
  if (fresh) session.value = fresh
  ballots.value = await fetchBallots(session.value.code).catch(() => ballots.value)
}
function startPolling() { if (poll) clearInterval(poll); poll = window.setInterval(refresh, 2500) }
onUnmounted(() => { if (poll) clearInterval(poll) })

// names stage
const nameError = ref('')
async function addName(name: string) {
  const n = name.trim()
  if (!session.value || !dept.value || !n) return
  if (dept.value.candidates.some(c => normalizeName(c.name) === normalizeName(n))) {
    nameError.value = L(`"${n}" is already on the list for this department.`, `"${n}" ya está en la lista de este departamento.`)
    return
  }
  nameError.value = ''
  dept.value.candidates.push({ id: crypto.randomUUID(), name: n })
  await sync()
}
async function addDraftName() { const v = nameDraft.value; await addName(v); if (!nameError.value) nameDraft.value = '' }
const allowSuggestions = computed(() => session.value?.ballot.allowSuggestions !== false)
async function toggleSuggestions(on: boolean) { await sync({ allowSuggestions: on }) }
async function approveSuggestion(i: number) {
  if (!dept.value) return
  const [name] = dept.value.suggestions.splice(i, 1)
  if (name) dept.value.candidates.push({ id: crypto.randomUUID(), name })
  await sync()
}
async function dismissSuggestion(i: number) { dept.value?.suggestions.splice(i, 1); await sync() }
async function removeCandidate(id: string) {
  if (!dept.value) return
  dept.value.candidates = dept.value.candidates.filter(c => c.id !== id)
  await sync()
}

// voting / results
const deptBallots = computed(() => dept.value ? ballots.value.filter(b => b.choices[dept.value!.id]) : [])
const tally = computed(() => {
  if (!dept.value) return []
  return dept.value.candidates.map((c, i) => ({
    candidate: c, number: i + 1,
    votes: deptBallots.value.filter(b => b.choices[dept.value!.id] === c.id).length,
  })).sort((a, b) => b.votes - a.votes)
})
const maxVotes = computed(() => Math.max(1, ...tally.value.map(t => t.votes)))
async function startVoting() { await sync({ phase: 'voting' }) }
async function showResults() { await sync({ phase: 'results' }) }
async function backToNames() { await sync({ phase: 'names' }) }
const isLast = computed(() => !!session.value && session.value.ballot.current >= totalDepts.value - 1)
async function nextDept() {
  if (!session.value) return
  if (isLast.value) await sync({ phase: 'done' })
  else await sync({ current: session.value.ballot.current + 1, phase: 'names' })
  ballots.value = await fetchBallots(session.value.code).catch(() => ballots.value)
}
function deptResult(d: SimpleDept) {
  const rows = d.candidates.map((c, i) => ({ c, number: i + 1, votes: ballots.value.filter(b => b.choices[d.id] === c.id).length })).sort((a, b) => b.votes - a.votes)
  return { director: rows[0], sub: rows[1] }
}
const copied = ref(false)
async function copySummary() {
  if (!session.value) return
  const lines = [`${session.value.title} — ${session.value.church}`, `${L('Session ID', 'ID de sesión')}: ${sessionId.value}`, `${L('Date', 'Fecha')}: ${new Date(session.value.createdAt).toLocaleString()}`, '']
  for (const d of session.value.ballot.departments) {
    const r = deptResult(d)
    lines.push(`${d.name}:`)
    lines.push(`  ${L('Director', 'Director/a')}: ${r.director ? `#${r.director.number} ${r.director.c.name} (${r.director.votes})` : '—'}`)
    if (r.sub) lines.push(`  ${L('Sub-Director', 'Subdirector/a')}: #${r.sub.number} ${r.sub.c.name} (${r.sub.votes})`)
  }
  await navigator.clipboard.writeText(lines.join('\n')).catch(() => {})
  copied.value = true; setTimeout(() => (copied.value = false), 2000)
}
const newPin = ref('')
const pinMsg = ref('')
async function changePin() {
  if (!session.value) return
  pinMsg.value = ''
  const code = newPin.value.trim()
  if (!validPin(code)) { pinMsg.value = L('New PIN must be exactly 6 digits.', 'El nuevo PIN debe tener exactamente 6 dígitos.'); return }
  if (code === session.value.code) { pinMsg.value = L('That is the current PIN.', 'Ese es el PIN actual.'); return }
  const existing = await getSession(code).catch(() => null)
  if (existing && existing.ballot.phase !== 'done') { pinMsg.value = L('That PIN is already in use — pick another.', 'Ese PIN ya está en uso — elija otro.'); return }
  const oldCode = session.value.code
  const moved: VoteSession = { ...session.value, code }
  await createSession(moved)
  await moveBallots(oldCode, code) // votes already cast follow the session to the new PIN
  await deleteSession(oldCode) // old QR + old PIN stop working here
  session.value = moved
  qrDataUrl.value = await QRCode.toDataURL(joinUrl(code), { width: 300 })
  ballots.value = await fetchBallots(code).catch(() => ballots.value)
  newPin.value = ''
  pinMsg.value = L('PIN changed. The old QR and PIN no longer work — voters must join with the new PIN.', 'PIN cambiado. El QR y PIN anteriores ya no funcionan — los votantes deben unirse con el nuevo PIN.')
  persist()
}
async function endSession() {
  if (poll) clearInterval(poll)
  session.value = null; ballots.value = []; setupDepts.splice(0)
  localStorage.removeItem(KEY); persist()
}
// resume a session after reload
;(async () => {
  if (saved?.code) {
    const s = await getSession(saved.code).catch(() => null)
    if (s && s.ballot.phase !== 'done') {
      if (!s.ballot.sessionId) { s.ballot.sessionId = crypto.randomUUID(); await updateSession(s).catch(() => {}) }
      session.value = s
      title.value = s.title; church.value = s.church
      qrDataUrl.value = await QRCode.toDataURL(joinUrl(s.code), { width: 300 })
      ballots.value = await fetchBallots(s.code).catch(() => [])
      startPolling()
    }
  }
})()
watch(lang, () => persist())
</script>

<template>
  <main class="wrap">
    <header class="topbar">
      <div><h1>{{ L('Church Election', 'Elección de la Iglesia') }}</h1><p class="sub">{{ L('Nominating Committee · Simple live voting', 'Comité de Nombramientos · Votación simple en vivo') }}</p></div>
      <div class="lang">
        <button :class="{ on: lang === 'en' }" @click="setLang('en')">EN · English</button>
        <button :class="{ on: lang === 'es' }" @click="setLang('es')">ES · Español</button>
      </div>
    </header>

    <!-- SETUP -->
    <section v-if="!session" class="card">
      <h2>{{ L('Start a session', 'Comenzar una sesión') }}</h2>
      <label>{{ L('Session title', 'Título de la sesión') }}<input v-model="title" :placeholder="L('e.g. Church Board Election 2027', 'ej. Elección de la Junta 2027')" /></label>
      <label>{{ L('Church', 'Iglesia') }}<input v-model="church" /></label>
      <h3>{{ L('Departments for next year', 'Departamentos para el próximo año') }}</h3>
      <label>{{ L('Department', 'Departamento') }}
        <select v-model="presetId"><option v-for="d in availablePresets" :key="d.id" :value="d.id">{{ es ? d.es : d.en }}</option></select>
      </label>
      <label v-if="presetId === 'custom'">{{ L('Custom department name', 'Nombre del departamento personalizado') }}<input v-model="customName" /></label>
      <button @click="addSetupDept">{{ L('Add department', 'Agregar departamento') }}</button>
      <ol class="deptlist">
        <li v-for="(d, i) in setupDepts" :key="i"><strong>{{ d.name }}</strong> <button @click="removeSetupDept(i)">{{ L('Remove', 'Eliminar') }}</button></li>
      </ol>
      <h3>{{ L('Session PIN — set by the pastor (6 digits)', 'PIN de la sesión — definido por el pastor (6 dígitos)') }}</h3>
      <p class="sub">{{ L('The pastor sets this PIN. It is the gate that protects the integrity of the vote: only people with this PIN can join, submit names, and vote. It starts blank on purpose — type the PIN you choose, or generate one and keep it. You can also change it anytime during the session.', 'El pastor define este PIN. Es la puerta que protege la integridad del voto: solo las personas con este PIN pueden unirse, enviar nombres y votar. Comienza en blanco a propósito — escriba el PIN que usted elija, o genere uno y consérvelo. También puede cambiarlo en cualquier momento durante la sesión.') }}</p>
      <label>{{ L('PIN', 'PIN') }}<input v-model="pin" inputmode="numeric" maxlength="6" class="pininput" :placeholder="L('Pastor sets 6 digits', 'El pastor define 6 dígitos')" /></label>
      <button @click="pin = newSessionCode()">🎲 {{ L('Generate one for me', 'Generar uno para mí') }}</button>
      <p v-if="pinError" class="error">{{ pinError }}</p>
      <button class="primary big" :disabled="!setupDepts.length || !validPin(pin)" @click="startSession">{{ L('Start session', 'Iniciar sesión') }} →</button>
      <p v-if="setupDepts.length && !validPin(pin)" class="sub">{{ L('Set a 6-digit PIN above to start.', 'Defina un PIN de 6 dígitos arriba para comenzar.') }}</p>
      <p class="sub">{{ L('Simple, Kahoot-style: one department at a time, on the big screen.', 'Simple, estilo Kahoot: un departamento a la vez, en la pantalla grande.') }}</p>
      <p v-if="!isLiveBackend" class="error">{{ L('Local demo mode: sessions live only on THIS device. Test the full flow here or in another tab of this browser — other phones will get \'Session not found\' until the shared database (live mode) is connected.', 'Modo demo local: las sesiones viven solo en ESTE dispositivo. Pruebe el flujo aquí o en otra pestaña de este navegador — otros teléfonos verán \'Sesión no encontrada\' hasta que se conecte la base de datos compartida (modo en vivo).') }}</p>
    </section>

    <!-- LIVE SESSION -->
    <template v-else-if="session && !isDone && dept">
      <section class="card stagehead">
        <p class="kicker">{{ session.title }} · {{ L('Department', 'Departamento') }} {{ session.ballot.current + 1 }} {{ L('of', 'de') }} {{ totalDepts }}</p>
        <p class="sub">{{ L('Session ID', 'ID de sesión') }}: <strong>{{ sessionIdShort }}</strong> · PIN: <strong>{{ session.code }}</strong></p>
        <h2 class="deptname">{{ dept.name }}</h2>
        <p>
          <span class="badge" :class="{ open: phase === 'voting' }">{{ phase === 'names' ? L('Collecting names', 'Recibiendo nombres') : phase === 'voting' ? L('VOTING OPEN', 'VOTACIÓN ABIERTA') : L('Results', 'Resultados') }}</span>
          <span class="badge">{{ deptBallots.length }} {{ L('votes in', 'votos') }}</span>
          <span class="badge" :class="{ open: isLiveBackend }">{{ isLiveBackend ? L('Live mode', 'Modo en vivo') : L('Local demo mode', 'Modo demo local') }}</span>
        </p>
        <ol class="steps">
          <li :class="{ cur: phase === 'names' }">1 · {{ L('Names', 'Nombres') }}</li>
          <li :class="{ cur: phase === 'voting' }">2 · {{ L('Vote by number', 'Votar por número') }}</li>
          <li :class="{ cur: phase === 'results' || phase === 'done' }">3 · {{ L('Results', 'Resultados') }}</li>
        </ol>
      </section>

      <div class="grid">
        <section class="card">
          <!-- NAMES -->
          <template v-if="phase === 'names'">
            <h3>{{ L('Names for', 'Nombres para') }} {{ dept.name }}</h3>
            <label class="switchrow">
              <input type="checkbox" :checked="allowSuggestions" @change="toggleSuggestions(($event.target as HTMLInputElement).checked)" />
              {{ L('Let the committee submit names from their phones', 'Permitir que el comité envíe nombres desde sus teléfonos') }}
            </label>
            <p class="sub" v-if="allowSuggestions">{{ L('Members submit names from their phones. The pastor or secretary adds each name here — it gets the next number. Duplicate names are rejected automatically.', 'Los miembros envían nombres desde sus teléfonos. El pastor o la secretaria agrega cada nombre aquí — recibe el siguiente número. Los nombres duplicados se rechazan automáticamente.') }}</p>
            <p class="sub" v-else>{{ L('Submissions are OFF. Only the president or secretary adds names here — phones can watch the list but cannot send names.', 'Los envíos están DESACTIVADOS. Solo el presidente o la secretaria agrega nombres aquí — los teléfonos pueden ver la lista pero no enviar nombres.') }}</p>
            <div v-if="dept.suggestions.length" class="suggest">
              <h4>{{ L('Submitted from phones — tap + to add', 'Enviados desde teléfonos — toque + para agregar') }}</h4>
              <ul><li v-for="(sg, i) in dept.suggestions" :key="i">{{ sg }}
                <button class="primary" @click="approveSuggestion(i)">+ {{ L('Add', 'Agregar') }}</button>
                <button @click="dismissSuggestion(i)">✕</button></li></ul>
            </div>
            <ol class="candlist">
              <li v-for="(c, i) in dept.candidates" :key="c.id"><span class="bignum">{{ i + 1 }}</span> {{ c.name }}
                <button @click="removeCandidate(c.id)">✕</button></li>
            </ol>
            <p v-if="!dept.candidates.length" class="sub">{{ L('No names yet.', 'Aún no hay nombres.') }}</p>
            <input v-model="nameDraft" :placeholder="L('Type a name and press Add', 'Escriba un nombre y presione Agregar')" @keyup.enter="addDraftName" />
            <button class="primary" @click="addDraftName">{{ L('Add name', 'Agregar nombre') }}</button>
            <p v-if="nameError" class="error">{{ nameError }}</p>
            <div class="actions">
              <button class="primary big" :disabled="dept.candidates.length < 2" @click="startVoting">{{ L('Start voting', 'Iniciar votación') }} →</button>
            </div>
          </template>

          <!-- VOTING -->
          <template v-else-if="phase === 'voting'">
            <h3>{{ L('Voting open — pick a number', 'Votación abierta — elija un número') }}</h3>
            <ol class="candlist">
              <li v-for="(c, i) in dept.candidates" :key="c.id"><span class="bignum">{{ i + 1 }}</span> {{ c.name }}</li>
            </ol>
            <p class="bigcount">{{ deptBallots.length }} {{ L('votes submitted', 'votos enviados') }}</p>
            <div class="actions">
              <button @click="backToNames">← {{ L('Back to names', 'Volver a nombres') }}</button>
              <button class="primary big" @click="showResults">{{ L('Close & show results', 'Cerrar y mostrar resultados') }} →</button>
            </div>
          </template>

          <!-- RESULTS -->
          <template v-else>
            <h3>{{ L('Results', 'Resultados') }} — {{ dept.name }}</h3>
            <div v-for="row in tally" :key="row.candidate.id" class="resultrow">
              <span class="bignum">{{ row.number }}</span>
              <div class="barwrap"><div class="bar" :style="{ width: `${(row.votes / maxVotes) * 100}%` }"></div><span class="rname">{{ row.candidate.name }}</span></div>
              <strong>{{ row.votes }}</strong>
            </div>
            <p v-if="tally.length" class="sub">
              {{ L('Director', 'Director/a') }}: <strong>{{ tally[0]?.candidate.name }}</strong>
              <span v-if="tally[1]"> · {{ L('Sub-Director', 'Subdirector/a') }}: <strong>{{ tally[1].candidate.name }}</strong></span>
            </p>
            <div class="actions">
              <button class="primary big" @click="nextDept">{{ isLast ? L('Finish — see summary', 'Terminar — ver resumen') : L('Next department', 'Siguiente departamento') }} →</button>
            </div>
          </template>
        </section>

        <aside class="card qrpanel">
          <h3>{{ L('Join the session', 'Únase a la sesión') }}</h3>
          <img :src="qrDataUrl" alt="QR code" width="300" height="300" />
          <p class="bigcode">{{ session.code }}</p>
          <p class="sub">{{ L('Scan the QR or enter the code on your phone. No app, no name — just vote by number.', 'Escanee el QR o ingrese el código en su teléfono. Sin app, sin nombre — solo vote por número.') }}</p>
          <button @click="refresh">{{ L('Refresh', 'Actualizar') }}</button>
          <p><a :href="qrJoinUrl()" target="_blank" rel="noopener">{{ L('Preview the voter screen', 'Vista previa de la pantalla del votante') }}</a></p>
          <div class="changepin">
            <h4>{{ L('Change PIN', 'Cambiar PIN') }}</h4>
            <p class="sub">{{ L('The old QR and PIN stop working immediately. Votes already cast stay counted.', 'El QR y el PIN anteriores dejan de funcionar de inmediato. Los votos ya emitidos siguen contados.') }}</p>
            <input v-model="newPin" inputmode="numeric" maxlength="6" :placeholder="L('New 6-digit PIN', 'Nuevo PIN de 6 dígitos')" class="pininput" />
            <button class="primary" @click="changePin">{{ L('Change PIN', 'Cambiar PIN') }}</button>
            <p v-if="pinMsg" class="sub">{{ pinMsg }}</p>
          </div>
        </aside>
      </div>
    </template>

    <!-- SUMMARY -->
    <section v-else class="card">
      <h2>{{ L('Elected board', 'Junta electa') }} — {{ session?.title }}</h2>
      <p class="sub">{{ L('Session ID', 'ID de sesión') }}: <strong>{{ sessionId }}</strong></p>
      <article v-for="d in session?.ballot.departments" :key="d.id" class="office">
        <h4>{{ d.name }}</h4>
        <p>{{ L('Director', 'Director/a') }}: <strong>{{ deptResult(d).director?.c.name || '—' }}</strong>
          <span v-if="deptResult(d).sub"> · {{ L('Sub-Director', 'Subdirector/a') }}: <strong>{{ deptResult(d).sub?.c.name }}</strong></span></p>
      </article>
      <button class="primary" @click="copySummary">{{ copied ? L('Copied', 'Copiado') : L('Copy summary for the minutes', 'Copiar resumen para las actas') }}</button>
      <button @click="endSession">{{ L('Start a new session', 'Comenzar una nueva sesión') }}</button>
    </section>

    <p class="foot">SDA Church Manual, Ch. 8 · {{ L('Anonymous voting: ballots carry no name.', 'Votación anónima: los votos no llevan nombre.') }}</p>
  </main>
</template>

<style scoped>
.wrap { max-width: 1020px; margin: 0 auto; padding: 20px 16px 48px; }
.topbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; background: linear-gradient(135deg, var(--navy), var(--navy-3)); border-bottom: 4px solid var(--gold); border-radius: var(--radius); padding: 22px 24px; box-shadow: var(--shadow); margin-bottom: 16px; }
.topbar h1 { color: #fff; margin: 0; font-size: 1.9rem; }
.topbar .sub { color: var(--gold-soft); margin: 4px 0 0; }
.lang { display: flex; gap: 6px; }
.lang button { background: transparent; color: #dbe6f5; border: 1.5px solid rgba(255,255,255,.45); }
.lang button.on { background: var(--gold); border-color: var(--gold); color: var(--navy); font-weight: 700; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px 22px; margin: 14px 0; box-shadow: var(--shadow); }
.stagehead { text-align: center; }
.kicker { color: var(--muted); font-weight: 600; letter-spacing: .04em; text-transform: uppercase; font-size: .85rem; }
.deptname { font-size: 2.6rem; margin: 6px 0; }
.steps { list-style: none; display: flex; justify-content: center; gap: 8px; padding: 0; flex-wrap: wrap; }
.steps li { padding: 6px 14px; border-radius: 999px; background: #e7edf6; color: var(--navy-3); font-weight: 600; }
.steps li.cur { background: var(--navy); color: #fff; box-shadow: inset 0 -3px 0 var(--gold); }
.grid { display: grid; grid-template-columns: 1fr 340px; gap: 14px; align-items: start; }
@media (max-width: 820px) { .grid { grid-template-columns: 1fr; } .deptname { font-size: 2rem; } }
.qrpanel { text-align: center; }
.qrpanel img { max-width: 100%; height: auto; border: 6px solid #fff; border-radius: 12px; box-shadow: var(--shadow); }
.bigcode { font-size: 2.4rem; font-weight: 800; letter-spacing: .3em; text-indent: .3em; color: var(--navy); margin: 6px 0; }
label { display: block; margin: 10px 0; font-weight: 600; color: var(--navy); }
input, select { margin-left: 8px; padding: 10px 12px; border-radius: 10px; border: 1.5px solid var(--line); background: #fbfcfe; color: var(--ink); font: inherit; font-weight: 400; min-height: 44px; }
button { padding: 10px 18px; border-radius: 999px; border: 1.5px solid var(--navy-3); background: #fff; color: var(--navy); margin: 4px; cursor: pointer; font: inherit; font-weight: 600; min-height: 44px; }
button.primary { background: var(--navy); color: #fff; border-color: var(--navy); }
button.big { font-size: 1.1rem; padding: 14px 26px; }
button:disabled { opacity: .45; cursor: not-allowed; }
.badge { display: inline-block; padding: 3px 12px; border-radius: 999px; background: #e7edf6; color: var(--navy-3); font-weight: 600; font-size: .9rem; margin-right: 6px; }
.badge.open { background: #fdf3d7; color: #7a5d00; border: 1px solid var(--gold); }
.candlist, .deptlist { list-style: none; padding: 0; }
.candlist li, .deptlist li { display: flex; align-items: center; gap: 12px; padding: 8px 0; font-size: 1.15rem; border-bottom: 1px solid var(--line); }
.bignum { display: inline-grid; place-items: center; min-width: 44px; height: 44px; padding: 0 8px; border-radius: 12px; background: var(--navy); color: var(--gold-soft); font-weight: 800; font-size: 1.25rem; }
.suggest { background: #fdf8e7; border: 1px solid var(--gold); border-radius: var(--radius); padding: 12px 16px; margin-bottom: 14px; }
.suggest ul { list-style: none; padding: 0; } .suggest li { padding: 4px 0; font-size: 1.05rem; }
.actions { margin-top: 18px; display: flex; gap: 8px; flex-wrap: wrap; }
.bigcount { font-size: 1.6rem; font-weight: 800; color: var(--navy); }
.resultrow { display: flex; align-items: center; gap: 12px; margin: 10px 0; }
.barwrap { flex: 1; position: relative; background: #eef3fa; border-radius: 10px; height: 44px; overflow: hidden; }
.bar { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, var(--navy-3), var(--navy)); opacity: .9; }
.rname { position: relative; line-height: 44px; padding-left: 12px; font-weight: 600; color: var(--navy); mix-blend-mode: normal; }
.resultrow:nth-child(1) .bar { background: var(--gold); }
.sub { opacity: .8; }
.switchrow { display: flex; align-items: center; gap: 10px; background: #eef3fa; border: 1.5px solid var(--line); border-radius: 12px; padding: 10px 14px; font-size: 1rem; }
.switchrow input { width: 22px; height: 22px; margin: 0; min-height: 0; accent-color: var(--navy); }
.pininput { font-size: 1.3rem; font-weight: 800; letter-spacing: .35em; text-align: center; max-width: 220px; }
.error { color: #8a1f1f; font-weight: 700; }
.changepin { border-top: 2px solid var(--line); margin-top: 16px; padding-top: 12px; }
.foot { text-align: center; color: var(--muted); font-size: .9rem; }
.office { border-top: 2px solid var(--line); padding: 12px 0 4px; }
</style>
