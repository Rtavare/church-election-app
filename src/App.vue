<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { DEPARTMENTS, ROLES } from './data/departments'
import { t } from './i18n'
import type { AppState, Ballot, Candidate, Consent, Department, Lang, Position, Stage } from './types'
import { createSession, fetchBallots, isLiveBackend, joinUrl, newSessionCode, setSessionOpen, type RemoteBallot } from './services/voteBackend'

const KEY = 'church-election-v2'
const load = (): AppState => {
  try { return JSON.parse(localStorage.getItem(KEY) || '') as AppState } catch {
    return { lang: 'en', election: null, stage: 'setup', committee: [], departments: [], votingOpen: false, ballots: [] }
  }
}
const state = reactive<AppState>(load())
watch(state, () => localStorage.setItem(KEY, JSON.stringify(state)), { deep: true })
const s = computed(() => t(state.lang))
const es = computed(() => state.lang === 'es')
const setLang = (l: Lang) => { state.lang = l }
const L = (en: string, esTxt: string) => (es.value ? esTxt : en)

const form = reactive({ title: '', church: '', termYears: 1 as 1 | 2, chair: '', secretary: '' })
function createElection() {
  if (!form.title.trim()) return
  state.election = { id: crypto.randomUUID(), ...form }
  state.stage = 'departments'
}
const newMember = ref('')
function addMember() { if (newMember.value.trim()) { state.committee.push(newMember.value.trim()); newMember.value = '' } }

// ---------- Step 1: Departments active next year ----------
const deptName = (d: Department): string => {
  if (d.presetId === 'custom') return d.customName
  const p = DEPARTMENTS.find(x => x.id === d.presetId)
  return p ? (es.value ? p.es : p.en) : d.customName
}
const deptPresetId = ref(DEPARTMENTS[0].id)
const customDept = ref('')
const availablePresets = computed(() =>
  DEPARTMENTS.filter(p => p.id === 'custom' || !state.departments.some(d => d.presetId === p.id)))
const roleTitle = (roleId: string) => { const r = ROLES.find(x => x.id === roleId); return r ? (es.value ? r.es : r.en) : roleId }
function addDepartment() {
  const preset = DEPARTMENTS.find(p => p.id === deptPresetId.value)
  if (!preset) return
  if (preset.id === 'custom' && !customDept.value.trim()) return
  const mk = (roleId: string): Position => ({ id: crypto.randomUUID(), title: roleTitle(roleId), candidateId: null })
  state.departments.push({
    id: crypto.randomUUID(), presetId: preset.id,
    customName: preset.id === 'custom' ? customDept.value.trim() : '',
    activeNextYear: true, candidates: [], positions: [mk('director'), mk('sub-director')],
  })
  customDept.value = ''
}
function removeDepartment(id: string) { state.departments = state.departments.filter(d => d.id !== id) }
const activeDepts = computed(() => state.departments.filter(d => d.activeNextYear))

// ---------- Step 2: Candidates per department ----------
const candidateDraft = reactive<Record<string, string>>({})
function addCandidate(d: Department) {
  const name = (candidateDraft[d.id] || '').trim()
  if (!name) return
  d.candidates.push({ id: crypto.randomUUID(), name, consent: 'not-asked' })
  candidateDraft[d.id] = ''
}
function removeCandidate(d: Department, c: Candidate) {
  d.candidates = d.candidates.filter(x => x.id !== c.id)
  d.positions.forEach(p => { if (p.candidateId === c.id) p.candidateId = null })
}
const candidateName = (d: Department, id: string | null) => d.candidates.find(c => c.id === id)?.name ?? '—'
const candidateConsent = (d: Department, id: string | null) => d.candidates.find(c => c.id === id)?.consent

// ---------- Step 3: Assign Director, Sub-Director, etc. ----------
const roleDraft = reactive<Record<string, string>>({})
const customRoleDraft = reactive<Record<string, string>>({})
function addPosition(d: Department) {
  const roleId = roleDraft[d.id] || 'director'
  const title = roleId === 'custom-role' ? (customRoleDraft[d.id] || '').trim() : roleTitle(roleId)
  if (!title) return
  d.positions.push({ id: crypto.randomUUID(), title, candidateId: null })
  customRoleDraft[d.id] = ''
}
function removePosition(d: Department, p: Position) { d.positions = d.positions.filter(x => x.id !== p.id) }
const unassignedCount = computed(() =>
  activeDepts.value.reduce((n, d) => n + d.positions.filter(p => !p.candidateId).length, 0))

// ---------- Anonymous ballot: one choice per position, from that department's pool ----------
interface BallotItem { position: Position; dept: Department }
const ballotItems = computed<BallotItem[]>(() =>
  activeDepts.value.flatMap(d => d.positions.map(position => ({ position, dept: d }))))
const tab = ref<'process' | 'departments' | 'assign' | 'ballot' | 'results' | 'guide'>('process')
const draft = reactive<Record<string, string | null>>({})
const justCast = ref(false)
function castBallot() {
  const ballot: Ballot = { id: crypto.randomUUID(), castAt: new Date().toISOString(), choices: { ...draft } }
  state.ballots.push(ballot)
  Object.keys(draft).forEach(k => delete draft[k])
  justCast.value = true
}
const remoteBallots = ref<RemoteBallot[]>([])
const allBallots = computed(() => [...state.ballots, ...remoteBallots.value])
function tally(item: BallotItem) {
  return item.dept.candidates.map(c => ({
    candidate: c,
    votes: allBallots.value.filter(b => b.choices[item.position.id] === c.id).length,
  })).sort((a, b) => b.votes - a.votes)
}
const abstentions = (item: BallotItem) => allBallots.value.filter(b => !b.choices[item.position.id]).length
function applyWinners() {
  for (const item of ballotItems.value) {
    const top = tally(item)[0]
    if (top && top.votes > 0) item.position.candidateId = top.candidate.id
  }
}

// ---------- QR session ----------
const qrSessionCode = ref<string | null>(null)
const qrDataUrl = ref('')
const qrJoinUrl = ref('')
const manualCode = ref('')
let qrPoll: number | undefined
async function refreshRemote() {
  if (qrSessionCode.value) { try { remoteBallots.value = await fetchBallots(qrSessionCode.value) } catch { /* keep last */ } }
}
async function openQrVoting() {
  if (!state.election) return
  const code = newSessionCode()
  await createSession({ code, title: state.election.title, church: state.election.church, lang: state.lang, open: true, createdAt: new Date().toISOString(),
    ballot: { offices: ballotItems.value.map(i => ({ id: i.position.id, department: deptName(i.dept), role: i.position.title, nominees: i.dept.candidates.map(c => ({ id: c.id, name: c.name })) })) } })
  qrSessionCode.value = code
  qrJoinUrl.value = joinUrl(code)
  qrDataUrl.value = await QRCode.toDataURL(qrJoinUrl.value, { width: 280 })
  state.votingOpen = true
  await refreshRemote()
  qrPoll = window.setInterval(refreshRemote, 3000)
}
async function closeQrVoting() {
  if (qrSessionCode.value) await setSessionOpen(qrSessionCode.value, false).catch(() => {})
  if (qrPoll) window.clearInterval(qrPoll)
}
function joinWithCode() {
  if (/^\d{6}$/.test(manualCode.value.trim())) window.location.hash = `#/vote/${manualCode.value.trim()}`
}
onUnmounted(() => { if (qrPoll) window.clearInterval(qrPoll) })

// ---------- Stages & report ----------
const stages: Stage[] = ['setup', 'departments', 'candidates', 'assignments', 'consent', 'report', 'voting', 'certification', 'done']
const stageIndex = computed(() => stages.indexOf(state.stage))
function moveStage(dir: 1 | -1) {
  state.stage = stages[Math.min(stages.length - 1, Math.max(0, stageIndex.value + dir))]
}
const copied = ref(false)
async function copyReport() {
  if (!state.election) return
  const lines = [`${state.election.title} — ${state.election.church} (${state.election.termYears}y)`,
    `${s.value.chair}: ${state.election.chair} · ${s.value.secretary}: ${state.election.secretary}`, '']
  for (const d of activeDepts.value) {
    lines.push(`${deptName(d)}:`)
    for (const p of d.positions) lines.push(`  ${p.title}: ${candidateName(d, p.candidateId)}`)
  }
  lines.push('', `${allBallots.value.length} ${s.value.ballotsCast}`)
  await navigator.clipboard.writeText(lines.join('\n')).catch(() => {})
  copied.value = true; setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <main class="wrap">
    <header class="topbar">
      <div><h1>{{ s.appTitle }}</h1><p class="sub">{{ s.appSub }}</p></div>
      <div class="lang" role="group" aria-label="Language">
        <button :class="{ on: state.lang === 'en' }" @click="setLang('en')">EN · English</button>
        <button :class="{ on: state.lang === 'es' }" @click="setLang('es')">ES · Español</button>
      </div>
    </header>

    <section v-if="!state.election" class="card">
      <h2>{{ s.createElection }}</h2>
      <label>{{ s.electionTitle }}<input v-model="form.title" /></label>
      <label>{{ s.church }}<input v-model="form.church" /></label>
      <label>{{ s.term }}<select v-model="form.termYears"><option :value="1">{{ s.oneYear }}</option><option :value="2">{{ s.twoYears }}</option></select></label>
      <label>{{ s.chair }}<input v-model="form.chair" /></label>
      <label>{{ s.secretary }}<input v-model="form.secretary" /></label>
      <button class="primary" @click="createElection">{{ s.start }}</button>
    </section>

    <template v-else>
      <section class="card">
        <h2>{{ state.election.title }}</h2>
        <p>{{ state.election.church }} · {{ state.election.termYears }}y · {{ s.chair }}: {{ state.election.chair }}</p>
        <p>
          <span class="badge">{{ activeDepts.length }} {{ L('departments active next year', 'departamentos activos el próximo año') }}</span>
          <span class="badge" :class="{ open: state.votingOpen }">{{ state.votingOpen ? s.votingOpen : s.votingClosed }} · {{ allBallots.length }} {{ s.ballotsCast }}</span>
          <span v-if="unassignedCount" class="badge warn">{{ unassignedCount }} {{ L('positions unassigned', 'puestos sin asignar') }}</span>
        </p>
        <button v-if="!state.votingOpen" class="primary" @click="state.votingOpen = true">{{ s.openVoting }}</button>
        <button v-else @click="state.votingOpen = false">{{ s.closeVoting }}</button>
      </section>

      <nav class="tabs">
        <button :class="{ on: tab === 'process' }" @click="tab = 'process'">{{ s.stages }}</button>
        <button :class="{ on: tab === 'departments' }" @click="tab = 'departments'">1 · {{ s.offices }}</button>
        <button :class="{ on: tab === 'assign' }" @click="tab = 'assign'">2–3 · {{ s.candAssign }}</button>
        <button :class="{ on: tab === 'ballot' }" @click="tab = 'ballot'">{{ s.ballot }}</button>
        <button :class="{ on: tab === 'results' }" @click="tab = 'results'">{{ s.results }}</button>
        <button :class="{ on: tab === 'guide' }" @click="tab = 'guide'">{{ s.guide }}</button>
      </nav>

      <section v-if="tab === 'process'" class="card">
        <ol class="stages"><li v-for="(name, i) in s.stageNames" :key="name" :class="{ cur: i === stageIndex, done: i < stageIndex }">{{ name }}</li></ol>
        <button @click="moveStage(-1)">{{ s.back }}</button>
        <button class="primary" @click="moveStage(1)">{{ s.advance }}</button>
        <h3>{{ s.committee }}</h3>
        <ul><li v-for="(m, i) in state.committee" :key="i">{{ m }} <button @click="state.committee.splice(i, 1)">{{ s.remove }}</button></li></ul>
        <input v-model="newMember" :placeholder="s.memberName" @keyup.enter="addMember" />
        <button @click="addMember">{{ s.addMember }}</button>
      </section>

      <!-- STEP 1: departments active next year -->
      <section v-if="tab === 'departments'" class="card">
        <h3>1 · {{ L('Departments active next year', 'Departamentos activos el próximo año') }}</h3>
        <p class="sub">{{ L('Add every department that will operate next year. You will name its candidates and leaders next.', 'Agregue cada departamento que operará el próximo año. Luego nombrará sus candidatos y líderes.') }}</p>
        <label>{{ s.department }}
          <select v-model="deptPresetId"><option v-for="d in availablePresets" :key="d.id" :value="d.id">{{ es ? d.es : d.en }}</option></select>
        </label>
        <label v-if="deptPresetId === 'custom'">{{ s.customDepartment }}<input v-model="customDept" /></label>
        <button class="primary" @click="addDepartment">{{ s.add }}</button>
        <article v-for="d in state.departments" :key="d.id" class="office">
          <h4>{{ deptName(d) }}</h4>
          <label class="inline"><input type="checkbox" v-model="d.activeNextYear" /> {{ L('Active next year', 'Activo el próximo año') }}</label>
          <span class="badge">{{ d.candidates.length }} {{ L('candidates', 'candidatos') }} · {{ d.positions.length }} {{ L('positions', 'puestos') }}</span>
          <button @click="removeDepartment(d.id)">{{ s.remove }}</button>
        </article>
      </section>

      <!-- STEPS 2–3: candidates per department, then assign roles -->
      <section v-if="tab === 'assign'" class="card">
        <h3>2 · {{ L('Candidates', 'Candidatos') }} &nbsp;→&nbsp; 3 · {{ L('Assign Director, Sub-Director…', 'Asignar Director, Subdirector…') }}</h3>
        <p v-if="!activeDepts.length" class="sub">{{ L('Add and activate departments first (step 1).', 'Primero agregue y active departamentos (paso 1).') }}</p>
        <article v-for="d in activeDepts" :key="d.id" class="office">
          <h4>{{ deptName(d) }}</h4>
          <h5>{{ L('Candidate pool', 'Candidatos del departamento') }} · {{ s.consent }}</h5>
          <ul>
            <li v-for="c in d.candidates" :key="c.id">{{ c.name }}
              <select v-model="c.consent"><option v-for="cv in (['not-asked','asked','agreed','declined'] as Consent[])" :key="cv" :value="cv">{{ s.consentValues[cv] }}</option></select>
              <button @click="removeCandidate(d, c)">{{ s.remove }}</button>
            </li>
          </ul>
          <input v-model="candidateDraft[d.id]" :placeholder="s.nomineeName" @keyup.enter="addCandidate(d)" />
          <button @click="addCandidate(d)">{{ s.addNominee }}</button>

          <h5>{{ L('Positions — assign a candidate to each', 'Puestos — asigne un candidato a cada uno') }}</h5>
          <ul>
            <li v-for="p in d.positions" :key="p.id">
              <strong>{{ p.title }}:</strong>
              <select v-model="p.candidateId">
                <option :value="null">— {{ L('Unassigned', 'Sin asignar') }} —</option>
                <option v-for="c in d.candidates" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
              <span v-if="p.candidateId" class="badge" :class="{ open: candidateConsent(d, p.candidateId) === 'agreed', warn: candidateConsent(d, p.candidateId) !== 'agreed' }">
                {{ s.consentValues[candidateConsent(d, p.candidateId) || 'not-asked'] }}
              </span>
              <button @click="removePosition(d, p)">{{ s.remove }}</button>
            </li>
          </ul>
          <label>{{ L('Add position', 'Agregar puesto') }}
            <select v-model="roleDraft[d.id]">
              <option v-for="r in ROLES" :key="r.id" :value="r.id">{{ es ? r.es : r.en }}</option>
            </select>
          </label>
          <label v-if="roleDraft[d.id] === 'custom-role'">{{ L('Custom role name', 'Nombre del cargo') }}<input v-model="customRoleDraft[d.id]" /></label>
          <button @click="addPosition(d)">{{ s.add }}</button>
        </article>
      </section>

      <section v-if="tab === 'ballot'" class="card">
        <div class="qrbox">
          <h3>{{ L('QR voting — voters on their own phones', 'Votación por QR — teléfonos de los votantes') }}</h3>
          <p class="badge" :class="{ open: isLiveBackend }">{{ isLiveBackend ? L('Live mode (Supabase)', 'Modo en vivo (Supabase)') : L('Local demo mode — test in this browser', 'Modo demo local — prueba en este navegador') }}</p>
          <div v-if="qrSessionCode">
            <img :src="qrDataUrl" alt="QR code to join the vote" width="280" height="280" />
            <p class="bigcode">{{ qrSessionCode }}</p>
            <p class="sub">{{ qrJoinUrl }}</p>
            <p>{{ remoteBallots.length }} {{ s.ballotsCast }} (QR)</p>
            <button @click="refreshRemote">{{ L('Refresh', 'Actualizar') }}</button>
            <button @click="closeQrVoting">{{ s.closeVoting }}</button>
          </div>
          <button v-else class="primary" @click="openQrVoting">{{ L('Open QR voting', 'Abrir votación por QR') }}</button>
          <div>
            <input v-model="manualCode" :placeholder="L('6-digit join code', 'Código de 6 dígitos')" inputmode="numeric" />
            <button @click="joinWithCode">{{ L('Join as voter', 'Unirse como votante') }}</button>
          </div>
        </div>
        <p>{{ s.ballotIntro }}</p>
        <div v-if="justCast" class="card ok"><p>{{ s.ballotCast }}</p><button class="primary" @click="justCast = false">{{ s.nextVoter }}</button></div>
        <template v-else-if="state.votingOpen">
          <fieldset v-for="item in ballotItems" :key="item.position.id">
            <legend>{{ deptName(item.dept) }} — {{ item.position.title }}</legend>
            <label v-for="c in item.dept.candidates" :key="c.id"><input type="radio" :name="item.position.id" :value="c.id" v-model="draft[item.position.id]" /> {{ c.name }}</label>
            <label><input type="radio" :name="item.position.id" :value="null" v-model="draft[item.position.id]" /> {{ s.abstain }}</label>
          </fieldset>
          <button class="primary" @click="castBallot">{{ s.castBallot }}</button>
        </template>
        <p v-else>{{ s.votingClosed }}</p>
      </section>

      <section v-if="tab === 'results'" class="card">
        <h3>{{ L('Slate by department', 'Propuesta por departamento') }}</h3>
        <article v-for="d in activeDepts" :key="d.id" class="office">
          <h4>{{ deptName(d) }}</h4>
          <ul>
            <li v-for="p in d.positions" :key="p.id"><strong>{{ p.title }}:</strong> {{ candidateName(d, p.candidateId) }}</li>
          </ul>
        </article>
        <h3>{{ s.results }} ({{ allBallots.length }} {{ s.ballotsCast }})</h3>
        <p v-if="!allBallots.length">{{ s.noVotesYet }}</p>
        <article v-for="item in ballotItems" :key="item.position.id" class="office">
          <h4>{{ deptName(item.dept) }} — {{ item.position.title }}</h4>
          <ul><li v-for="(row, i) in tally(item)" :key="row.candidate.id">{{ row.candidate.name }}: {{ row.votes }} {{ s.votes }} <span v-if="i === 0 && row.votes > 0" class="badge open">{{ s.elected }}</span></li></ul>
          <p class="sub">{{ s.abstain }}: {{ abstentions(item) }}</p>
        </article>
        <button v-if="allBallots.length" class="primary" @click="applyWinners">{{ L('Apply vote winners as assignments', 'Aplicar ganadores del voto como asignaciones') }}</button>
        <button @click="copyReport">{{ copied ? s.reportCopied : s.copyReport }}</button>
        <button class="primary" @click="moveStage(1)">{{ s.certify }}</button>
      </section>

      <section v-if="tab === 'guide'" class="card"><ol><li v-for="line in s.guideBody" :key="line">{{ line }}</li></ol></section>
    </template>
  </main>
</template>

<style scoped>
.wrap { max-width: 820px; margin: 0 auto; padding: 20px 16px 48px; }
.topbar {
  display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
  background: linear-gradient(135deg, var(--navy) 0%, var(--navy-3) 100%);
  border-bottom: 4px solid var(--gold); border-radius: var(--radius); padding: 22px 24px; box-shadow: var(--shadow); margin-bottom: 16px;
}
.topbar h1 { color: #fff; margin: 0; font-size: 1.9rem; letter-spacing: .2px; }
.topbar .sub { color: var(--gold-soft); margin: 4px 0 0; font-size: .95rem; }
.lang { display: flex; gap: 6px; }
.lang button { background: transparent; color: #dbe6f5; border: 1.5px solid rgba(255,255,255,.45); }
.lang button.on { background: var(--gold); border-color: var(--gold); color: var(--navy); font-weight: 700; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px 22px; margin: 14px 0; box-shadow: var(--shadow); }
.card h2 { margin-top: 0; }
.office { border-top: 2px solid var(--line); padding: 16px 0 6px; margin-top: 16px; }
.office h4 { margin: 0 0 6px; font-size: 1.08rem; }
label { display: block; margin: 10px 0; font-weight: 600; color: var(--navy); }
label.inline { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; color: var(--ink); }
input, select { margin-left: 8px; padding: 10px 12px; border-radius: 10px; border: 1.5px solid var(--line); background: #fbfcfe; color: var(--ink); font: inherit; font-weight: 400; min-height: 44px; }
input[type='checkbox'] { min-height: 0; width: 20px; height: 20px; accent-color: var(--navy); margin: 0; }
input:focus, select:focus { outline: 2px solid var(--gold); outline-offset: 1px; border-color: var(--gold); }
button { padding: 10px 18px; border-radius: 999px; border: 1.5px solid var(--navy-3); background: #fff; color: var(--navy); margin: 4px; cursor: pointer; font: inherit; font-weight: 600; min-height: 44px; }
button:active { transform: scale(.98); }
button.primary { background: var(--navy); color: #fff; border-color: var(--navy); }
button.primary:hover { background: var(--navy-3); }
button.on { background: var(--navy); color: #fff; }
.tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 2px; }
.tabs button { background: #e7edf6; border-color: transparent; color: var(--navy-3); }
.tabs button.on { background: var(--navy); color: #fff; box-shadow: inset 0 -3px 0 var(--gold); }
.badge { display: inline-block; padding: 3px 12px; border-radius: 999px; background: #e7edf6; color: var(--navy-3); font-weight: 600; font-size: .9rem; margin-right: 6px; }
.badge.open { background: #fdf3d7; color: #7a5d00; border: 1px solid var(--gold); }
.badge.warn { background: #fde8e8; color: #8a1f1f; border: 1px solid #e5a3a3; }
.stages { list-style: none; padding: 0; counter-reset: step; }
.stages li { padding: 8px 0 8px 42px; position: relative; color: var(--muted); }
.stages li::before { counter-increment: step; content: counter(step); position: absolute; left: 0; top: 4px; width: 30px; height: 30px; border-radius: 50%; background: #e7edf6; color: var(--navy-3); font-weight: 700; display: grid; place-items: center; font-size: .9rem; }
.stages li.cur { font-weight: 700; color: var(--navy); }
.stages li.cur::before { background: var(--navy); color: #fff; box-shadow: 0 0 0 3px var(--gold-soft); }
.stages li.done { color: var(--muted); }
.stages li.done::before { background: var(--gold); color: var(--navy); content: '✓'; }
.sub { opacity: .8; }
.ok { background: #fdf8e7; border: 1px solid var(--gold); border-radius: var(--radius); padding: 14px; }
fieldset { border: 1.5px solid var(--line); border-radius: var(--radius); margin: 12px 0; padding: 12px 16px; background: #fbfcfe; }
legend { font-weight: 700; color: var(--navy); padding: 0 6px; }
fieldset label { font-weight: 500; color: var(--ink); background: #fff; border: 1.5px solid var(--line); border-radius: 12px; padding: 12px 14px; min-height: 52px; display: flex; align-items: center; gap: 10px; }
fieldset label:has(input:checked) { border-color: var(--gold); background: #fdf8e7; box-shadow: inset 0 0 0 1px var(--gold); }
fieldset input[type='radio'] { width: 22px; height: 22px; accent-color: var(--navy); margin: 0; min-height: 0; }
.qrbox { text-align: center; border: 2px dashed var(--gold); border-radius: var(--radius); padding: 18px; margin-bottom: 18px; background: linear-gradient(180deg, #fffdf4, #fff); }
.qrbox img { border: 6px solid #fff; border-radius: 12px; box-shadow: var(--shadow); max-width: 100%; height: auto; }
.bigcode { font-size: 2.6rem; font-weight: 800; letter-spacing: .35em; color: var(--navy); margin: 8px 0 0; text-indent: .35em; }
@media (max-width: 560px) { .topbar h1 { font-size: 1.5rem; } .bigcode { font-size: 2rem; } }
</style>
