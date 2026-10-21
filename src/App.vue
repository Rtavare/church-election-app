<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { DEPARTMENTS } from './data/departments'
import { t } from './i18n'
import type { AppState, Ballot, Consent, Lang, Office, Stage } from './types'

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
function tally(office: Office) {
  return office.nominees.map(n => ({
    nominee: n,
    votes: state.ballots.filter(b => b.choices[office.id] === n.id).length,
  })).sort((a, b) => b.votes - a.votes)
}
const abstentions = (office: Office) => state.ballots.filter(b => !b.choices[office.id]).length

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
    <header>
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
.wrap { max-width: 760px; margin: 0 auto; padding: 16px; font-family: system-ui, sans-serif; }
header, .lang { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.card { border: 1px solid #ddd; border-radius: 12px; padding: 16px; margin: 12px 0; }
.office { border-top: 1px solid #eee; padding: 12px 0; }
label { display: block; margin: 8px 0; }
input, select { margin-left: 8px; padding: 8px; border-radius: 8px; border: 1px solid #bbb; }
button { padding: 8px 14px; border-radius: 999px; border: 1px solid #888; background: #fff; margin: 4px; cursor: pointer; }
button.primary { background: #14532d; color: #fff; border-color: #14532d; }
button.on { background: #222; color: #fff; }
.tabs { display: flex; flex-wrap: wrap; gap: 4px; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #eee; }
.badge.open { background: #dcfce7; }
.stages li.cur { font-weight: 700; } .stages li.done { opacity: .55; text-decoration: line-through; }
.sub { opacity: .75; } .ok { background: #f0fdf4; }
fieldset { border: 1px solid #ddd; border-radius: 12px; margin: 10px 0; }
</style>
