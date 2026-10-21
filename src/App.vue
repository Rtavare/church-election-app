<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { DEPARTMENTS } from './data/departments'
import { t } from './i18n'
import type { AppState, Ballot, Consent, Lang, Office, Stage } from './types'
import { createSession, fetchBallots, isLiveBackend, joinUrl, newSessionCode, setSessionOpen, type RemoteBallot } from './services/voteBackend'

const KEY = 'church-election-v1'
const load = (): AppState => {
  try { return JSON.parse(localStorage.getItem(KEY) || '') as AppState } catch {
    return { lang: 'en', election: null, stage: 'setup', committee: [], offices: [], votingOpen: false, ballots: [] }
  }
}
const state = reactive<AppState>(load())
watch(state, () => localStorage.setItem(KEY, JSON.stringify(state)), { deep: true })
const s = computed(() => t(state.lang))
const setLang = (l: Lang) => { state.lang = l }

const form = reactive({ title: '', church: '', termYears: 1 as 1 | 2, chair: '', secretary: '' })
function createElection() {
  if (!form.title.trim()) return
  state.election = { id: crypto.randomUUID(), ...form }
  state.stage = 'nominating'
}
const newMember = ref('')
function addMember() { if (newMember.value.trim()) { state.committee.push(newMember.value.trim()); newMember.value = '' } }

const deptId = ref(DEPARTMENTS[0].id)
const customDept = ref('')
const role = ref('')
const slots = ref(1)
const selectedPreset = computed(() => DEPARTMENTS.find(d => d.id === deptId.value))
// Match the hosted prototype: departments already added disappear from the dropdown.
const availableDepartments = computed(() =>
  DEPARTMENTS.filter(d => d.id === 'custom' || !state.offices.some(o => o.departmentId === d.id)))
function addOffice() {
  const preset = selectedPreset.value
  if (!preset) return
  const department = preset.id === 'custom' ? customDept.value.trim() : (state.lang === 'es' ? preset.es : preset.en)
  if (!department) return
  state.offices.push({
    id: crypto.randomUUID(), departmentId: preset.id, department,
    role: role.value.trim() || (state.lang === 'es' ? preset.roleEs : preset.roleEn),
    slots: Math.max(1, slots.value), nominees: [],
  } as Office)
  role.value = ''; customDept.value = ''
}
function removeOffice(id: string) { state.offices = state.offices.filter(o => o.id !== id) }

const nomineeDraft = reactive<Record<string, string>>({})
function addNominee(office: Office) {
  const name = (nomineeDraft[office.id] || '').trim()
  if (!name) return
  office.nominees.push({ id: crypto.randomUUID(), name, consent: 'not-asked' })
  nomineeDraft[office.id] = ''
}

const tab = ref<'process' | 'offices' | 'ballot' | 'results' | 'guide'>('process')
const draft = reactive<Record<string, string | null>>({})
const justCast = ref(false)
function castBallot() {
  // Anonymous by design: Ballot has no voter identity field.
  const ballot: Ballot = { id: crypto.randomUUID(), castAt: new Date().toISOString(), choices: { ...draft } }
  state.ballots.push(ballot)
  Object.keys(draft).forEach(k => delete draft[k])
  justCast.value = true
}
const allBallots = computed(() => [...state.ballots, ...remoteBallots.value])
function tally(office: Office) {
  return office.nominees.map(n => ({
    nominee: n,
    votes: allBallots.value.filter(b => b.choices[office.id] === n.id).length,
  })).sort((a, b) => b.votes - a.votes)
}
const abstentions = (office: Office) => allBallots.value.filter(b => !b.choices[office.id]).length

// ---- QR voting session (voters on their own phones) ----
const remoteBallots = ref<RemoteBallot[]>([])
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
    ballot: { offices: state.offices.map(o => ({ id: o.id, department: o.department, role: o.role, nominees: o.nominees.map(n => ({ id: n.id, name: n.name })) })) } })
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

const stages: Stage[] = ['setup', 'nominating', 'consent', 'report', 'voting', 'certification', 'done']
const stageIndex = computed(() => stages.indexOf(state.stage))
function moveStage(dir: 1 | -1) {
  state.stage = stages[Math.min(stages.length - 1, Math.max(0, stageIndex.value + dir))]
}
const copied = ref(false)
async function copyReport() {
  if (!state.election) return
  const lines = [`${state.election.title} — ${state.election.church} (${state.election.termYears}y)`,
    `${s.value.chair}: ${state.election.chair} · ${s.value.secretary}: ${state.election.secretary}`, '']
  for (const o of state.offices) {
    const top = tally(o)[0]
    lines.push(`${o.department} — ${o.role}: ${top ? top.nominee.name : '—'} (${top?.votes ?? 0} ${s.value.votes})`)
  }
  lines.push('', `${state.ballots.length} ${s.value.ballotsCast}`)
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
        <p class="badge" :class="{ open: state.votingOpen }">{{ state.votingOpen ? s.votingOpen : s.votingClosed }} · {{ state.ballots.length }} {{ s.ballotsCast }}</p>
        <button v-if="!state.votingOpen" class="primary" @click="state.votingOpen = true">{{ s.openVoting }}</button>
        <button v-else @click="state.votingOpen = false">{{ s.closeVoting }}</button>
      </section>

      <nav class="tabs">
        <button :class="{ on: tab === 'process' }" @click="tab = 'process'">{{ s.stages }}</button>
        <button :class="{ on: tab === 'offices' }" @click="tab = 'offices'">{{ s.offices }}</button>
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

      <section v-if="tab === 'offices'" class="card">
        <h3>{{ s.addOffice }}</h3>
        <label>{{ s.department }}
          <select v-model="deptId"><option v-for="d in availableDepartments" :key="d.id" :value="d.id">{{ state.lang === 'es' ? d.es : d.en }}</option></select>
        </label>
        <label v-if="deptId === 'custom'">{{ s.customDepartment }}<input v-model="customDept" /></label>
        <label>{{ s.role }}<input v-model="role" :placeholder="selectedPreset ? (state.lang === 'es' ? selectedPreset.roleEs : selectedPreset.roleEn) : ''" /></label>
        <label>{{ s.slots }}<input v-model.number="slots" type="number" min="1" /></label>
        <button class="primary" @click="addOffice">{{ s.add }}</button>
        <article v-for="o in state.offices" :key="o.id" class="office">
          <h4>{{ o.department }} — {{ o.role }} (×{{ o.slots }})</h4>
          <button @click="removeOffice(o.id)">{{ s.remove }}</button>
          <h5>{{ s.nominees }} · {{ s.consent }}</h5>
          <ul><li v-for="n in o.nominees" :key="n.id">{{ n.name }}
            <select v-model="n.consent"><option v-for="c in (['not-asked','asked','agreed','declined'] as Consent[])" :key="c" :value="c">{{ s.consentValues[c] }}</option></select>
            <button @click="o.nominees = o.nominees.filter(x => x.id !== n.id)">{{ s.remove }}</button></li></ul>
          <input v-model="nomineeDraft[o.id]" :placeholder="s.nomineeName" @keyup.enter="addNominee(o)" />
          <button @click="addNominee(o)">{{ s.addNominee }}</button>
        </article>
      </section>

      <section v-if="tab === 'ballot'" class="card">
        <div class="qrbox">
          <h3>{{ state.lang === 'es' ? 'Votación por QR — teléfonos de los votantes' : 'QR voting — voters on their own phones' }}</h3>
          <p class="badge" :class="{ open: isLiveBackend }">{{ isLiveBackend ? (state.lang === 'es' ? 'Modo en vivo (Supabase)' : 'Live mode (Supabase)') : (state.lang === 'es' ? 'Modo demo local — prueba en este navegador' : 'Local demo mode — test in this browser') }}</p>
          <div v-if="qrSessionCode">
            <img :src="qrDataUrl" alt="QR code to join the vote" width="280" height="280" />
            <p class="bigcode">{{ qrSessionCode }}</p>
            <p class="sub">{{ qrJoinUrl }}</p>
            <p>{{ remoteBallots.length }} {{ s.ballotsCast }} (QR)</p>
            <button @click="refreshRemote">{{ state.lang === 'es' ? 'Actualizar' : 'Refresh' }}</button>
            <button @click="closeQrVoting">{{ s.closeVoting }}</button>
          </div>
          <button v-else class="primary" @click="openQrVoting">{{ state.lang === 'es' ? 'Abrir votación por QR' : 'Open QR voting' }}</button>
          <div>
            <input v-model="manualCode" :placeholder="state.lang === 'es' ? 'Código de 6 dígitos' : '6-digit join code'" inputmode="numeric" />
            <button @click="joinWithCode">{{ state.lang === 'es' ? 'Unirse como votante' : 'Join as voter' }}</button>
          </div>
        </div>
        <p>{{ s.ballotIntro }}</p>
        <div v-if="justCast" class="card ok"><p>{{ s.ballotCast }}</p><button class="primary" @click="justCast = false">{{ s.nextVoter }}</button></div>
        <template v-else-if="state.votingOpen">
          <fieldset v-for="o in state.offices" :key="o.id">
            <legend>{{ o.department }} — {{ o.role }}</legend>
            <label v-for="n in o.nominees" :key="n.id"><input type="radio" :name="o.id" :value="n.id" v-model="draft[o.id]" /> {{ n.name }}</label>
            <label><input type="radio" :name="o.id" :value="null" v-model="draft[o.id]" /> {{ s.abstain }}</label>
          </fieldset>
          <button class="primary" @click="castBallot">{{ s.castBallot }}</button>
        </template>
        <p v-else>{{ s.votingClosed }}</p>
      </section>

      <section v-if="tab === 'results'" class="card">
        <p v-if="!state.ballots.length">{{ s.noVotesYet }}</p>
        <article v-for="o in state.offices" :key="o.id">
          <h4>{{ o.department }} — {{ o.role }}</h4>
          <ul><li v-for="(row, i) in tally(o)" :key="row.nominee.id">{{ row.nominee.name }}: {{ row.votes }} {{ s.votes }} <span v-if="i === 0 && row.votes > 0" class="badge open">{{ s.elected }}</span></li></ul>
          <p class="sub">{{ s.abstain }}: {{ abstentions(o) }}</p>
        </article>
        <button @click="copyReport">{{ copied ? s.reportCopied : s.copyReport }}</button>
        <button class="primary" @click="moveStage(1)">{{ s.certify }}</button>
      </section>

      <section v-if="tab === 'guide'" class="card"><ol><li v-for="line in s.guideBody" :key="line">{{ line }}</li></ol></section>
    </template>
  </main>
</template>

<style scoped>
/* ——— Modern navy + gold ——— */
.wrap { max-width: 820px; margin: 0 auto; padding: 20px 16px 48px; }
.topbar {
  display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
  background: linear-gradient(135deg, var(--navy) 0%, var(--navy-3) 100%);
  border-bottom: 4px solid var(--gold);
  border-radius: var(--radius); padding: 22px 24px; box-shadow: var(--shadow); margin-bottom: 16px;
}
.topbar h1 { color: #fff; margin: 0; font-size: 1.9rem; letter-spacing: .2px; }
.topbar .sub { color: var(--gold-soft); margin: 4px 0 0; font-size: .95rem; }
.lang { display: flex; gap: 6px; }
.lang button { background: transparent; color: #dbe6f5; border: 1.5px solid rgba(255,255,255,.45); }
.lang button.on { background: var(--gold); border-color: var(--gold); color: var(--navy); font-weight: 700; }
.card {
  background: var(--card); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 20px 22px; margin: 14px 0; box-shadow: var(--shadow);
}
.card h2 { margin-top: 0; }
.office { border-top: 2px solid var(--line); padding: 16px 0 6px; margin-top: 16px; }
.office h4 { margin: 0 0 6px; font-size: 1.08rem; }
label { display: block; margin: 10px 0; font-weight: 600; color: var(--navy); }
input, select {
  margin-left: 8px; padding: 10px 12px; border-radius: 10px; border: 1.5px solid var(--line);
  background: #fbfcfe; color: var(--ink); font: inherit; font-weight: 400; min-height: 44px;
}
input:focus, select:focus { outline: 2px solid var(--gold); outline-offset: 1px; border-color: var(--gold); }
button {
  padding: 10px 18px; border-radius: 999px; border: 1.5px solid var(--navy-3); background: #fff;
  color: var(--navy); margin: 4px; cursor: pointer; font: inherit; font-weight: 600; min-height: 44px;
  transition: transform .05s ease, background .15s ease;
}
button:active { transform: scale(.98); }
button.primary { background: var(--navy); color: #fff; border-color: var(--navy); }
button.primary:hover { background: var(--navy-3); }
button.on { background: var(--navy); color: #fff; }
.tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 2px; }
.tabs button { background: #e7edf6; border-color: transparent; color: var(--navy-3); }
.tabs button.on { background: var(--navy); color: #fff; box-shadow: inset 0 -3px 0 var(--gold); }
.badge { display: inline-block; padding: 3px 12px; border-radius: 999px; background: #e7edf6; color: var(--navy-3); font-weight: 600; font-size: .9rem; }
.badge.open { background: #fdf3d7; color: #7a5d00; border: 1px solid var(--gold); }
.stages { list-style: none; padding: 0; counter-reset: step; }
.stages li { padding: 8px 0 8px 42px; position: relative; color: var(--muted); }
.stages li::before {
  counter-increment: step; content: counter(step);
  position: absolute; left: 0; top: 4px; width: 30px; height: 30px; border-radius: 50%;
  background: #e7edf6; color: var(--navy-3); font-weight: 700; display: grid; place-items: center; font-size: .9rem;
}
.stages li.cur { font-weight: 700; color: var(--navy); }
.stages li.cur::before { background: var(--navy); color: #fff; box-shadow: 0 0 0 3px var(--gold-soft); }
.stages li.done { color: var(--muted); }
.stages li.done::before { background: var(--gold); color: var(--navy); content: '✓'; }
.sub { opacity: .8; }
.ok { background: #fdf8e7; border: 1px solid var(--gold); border-radius: var(--radius); padding: 14px; }
fieldset { border: 1.5px solid var(--line); border-radius: var(--radius); margin: 12px 0; padding: 12px 16px; background: #fbfcfe; }
legend { font-weight: 700; color: var(--navy); padding: 0 6px; }
fieldset label {
  font-weight: 500; color: var(--ink); background: #fff; border: 1.5px solid var(--line);
  border-radius: 12px; padding: 12px 14px; min-height: 52px; display: flex; align-items: center; gap: 10px;
}
fieldset label:has(input:checked) { border-color: var(--gold); background: #fdf8e7; box-shadow: inset 0 0 0 1px var(--gold); }
fieldset input[type='radio'] { width: 22px; height: 22px; accent-color: var(--navy); margin: 0; min-height: 0; }
.qrbox { text-align: center; border: 2px dashed var(--gold); border-radius: var(--radius); padding: 18px; margin-bottom: 18px; background: linear-gradient(180deg, #fffdf4, #fff); }
.qrbox img { border: 6px solid #fff; border-radius: 12px; box-shadow: var(--shadow); max-width: 100%; height: auto; }
.bigcode { font-size: 2.6rem; font-weight: 800; letter-spacing: .35em; color: var(--navy); margin: 8px 0 0; text-indent: .35em; }
@media (max-width: 560px) { .topbar h1 { font-size: 1.5rem; } .bigcode { font-size: 2rem; } }
</style>
