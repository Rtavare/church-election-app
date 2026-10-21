<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { fetchBallots, getSession, type RemoteBallot, type SimpleDept, type VoteSession } from '../services/voteBackend'

// Live board dashboard — mind-map style hierarchy:
// Church (center) → Departments → Elected officials (Director → Sub-Director).
// Viewable only with the Session ID + the pastor's PIN. Officials appear
// only after the committee vote for that department is submitted as approved.
const props = defineProps<{ code?: string; sessionId?: string }>()
const pinInput = ref(props.code || '')
const idInput = ref(props.sessionId || '')
const session = ref<VoteSession | null>(null)
const ballots = ref<RemoteBallot[]>([])
const error = ref('')
const unlocked = ref(false)
let poll: number | undefined

const es = computed(() => session.value?.lang === 'es')
const t = (en: string, esTxt: string) => (es.value ? esTxt : en)

async function tryOpen(code: string, id: string) {
  error.value = ''
  const s = await getSession(code.trim()).catch(() => null)
  if (!s) { error.value = 'Session not found for that PIN. Check the PIN and try again.'; return }
  const realId = s.ballot.sessionId || ''
  if (realId && id.trim().toLowerCase() !== realId.toLowerCase()) {
    error.value = 'That Session ID does not match this PIN. Both must come from the same session.'
    return
  }
  session.value = s
  ballots.value = await fetchBallots(s.code).catch(() => [])
  unlocked.value = true
  if (poll) clearInterval(poll)
  poll = window.setInterval(async () => {
    const fresh = await getSession(s.code).catch(() => null)
    if (fresh) session.value = fresh
    ballots.value = await fetchBallots(s.code).catch(() => ballots.value)
  }, 3000)
}
async function openFromForm() { await tryOpen(pinInput.value, idInput.value) }

function statusOf(d: SimpleDept, idx: number) {
  if (d.approved) return 'approved'
  if (session.value && idx === session.value.ballot.current) {
    return session.value.ballot.phase === 'voting' ? 'voting' : session.value.ballot.phase === 'results' ? 'results' : 'names'
  }
  return 'waiting'
}
const votesFor = (d: SimpleDept) => ballots.value.filter(b => b.choices[d.id]).length
const approvedCount = computed(() => session.value?.ballot.departments.filter(d => d.approved).length || 0)

onMounted(() => { if (props.code && props.sessionId) tryOpen(props.code, props.sessionId) })
onUnmounted(() => { if (poll) clearInterval(poll) })
</script>

<template>
  <main class="wrap">
    <!-- Sign-in gate: Session ID + PIN -->
    <section v-if="!unlocked" class="card gate">
      <h1>{{ t('Live Board Dashboard', 'Tablero en vivo') }}</h1>
      <p class="sub">{{ t('Enter the Session ID and the PIN set by the pastor / committee president to view the live church board.', 'Ingrese el ID de sesión y el PIN definido por el pastor / presidente del comité para ver la junta en vivo.') }}</p>
      <label>{{ t('Session ID', 'ID de sesión') }}<input v-model="idInput" :placeholder="t('e.g. 3F9A… full ID from the host screen', 'ej. 3F9A… ID completo de la pantalla del anfitrión')" /></label>
      <label>{{ t('PIN (6 digits)', 'PIN (6 dígitos)') }}<input v-model="pinInput" inputmode="numeric" maxlength="6" placeholder="••••••" @keyup.enter="openFromForm" /></label>
      <button class="primary big" @click="openFromForm">{{ t('View dashboard', 'Ver tablero') }}</button>
      <p v-if="error" class="error">{{ error }}</p>
    </section>

    <!-- Mind-map board -->
    <template v-else-if="session">
      <div class="rootnode">
        <p class="kicker">{{ session.church || t('Our Church', 'Nuestra Iglesia') }}</p>
        <h1>{{ session.title }}</h1>
        <p class="sub">{{ t('Elected board', 'Junta electa') }} · {{ approvedCount }} / {{ session.ballot.departments.length }} {{ t('departments approved', 'departamentos aprobados') }} · <span class="livedot">● LIVE</span></p>
      </div>
      <div class="stem"></div>
      <div class="branches">
        <article v-for="(d, idx) in session.ballot.departments" :key="d.id" class="dept" :class="{ approved: !!d.approved, active: statusOf(d, idx) === 'voting' || statusOf(d, idx) === 'names' }">
          <h2>{{ d.name }}</h2>
          <template v-if="d.approved">
            <div class="official gold">
              <span class="role">{{ t('Director', 'Director/a') }}</span>
              <span class="name">{{ d.approved.director?.name || '—' }}</span>
              <span v-if="d.approved.director" class="meta">#{{ d.approved.director.number }} · {{ d.approved.director.votes }} {{ t('votes', 'votos') }}</span>
            </div>
            <div class="connector"></div>
            <div class="official">
              <span class="role">{{ t('Sub-Director', 'Subdirector/a') }}</span>
              <span class="name">{{ d.approved.sub?.name || '—' }}</span>
              <span v-if="d.approved.sub" class="meta">#{{ d.approved.sub.number }} · {{ d.approved.sub.votes }} {{ t('votes', 'votos') }}</span>
            </div>
            <p class="stamp">✓ {{ t('Approved', 'Aprobado') }}</p>
          </template>
          <template v-else>
            <p class="pending" v-if="statusOf(d, idx) === 'voting'">🗳️ {{ t('Voting now', 'Votando ahora') }} · {{ votesFor(d) }} {{ t('votes in', 'votos') }}</p>
            <p class="pending" v-else-if="statusOf(d, idx) === 'names'">📝 {{ t('Collecting names', 'Recibiendo nombres') }} · {{ d.candidates.length }} {{ t('on the list', 'en la lista') }}</p>
            <p class="pending" v-else-if="statusOf(d, idx) === 'results'">⏳ {{ t('Vote done — waiting for approval', 'Votación terminada — esperando aprobación') }}</p>
            <p class="pending" v-else>… {{ t('Waiting its turn', 'Esperando su turno') }}</p>
          </template>
        </article>
      </div>
      <p class="foot">{{ t('This board updates live. Officials appear only after the committee vote is submitted as approved.', 'Este tablero se actualiza en vivo. Los oficiales aparecen solo después de que el voto del comité se envía como aprobado.') }}</p>
    </template>
  </main>
</template>

<style scoped>
.wrap { max-width: 1200px; margin: 0 auto; padding: 20px 16px 48px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 22px; box-shadow: var(--shadow); }
.gate { max-width: 520px; margin: 40px auto; }
label { display: block; margin: 12px 0; font-weight: 600; color: var(--navy); }
input { width: 100%; margin-top: 6px; padding: 12px; border-radius: 10px; border: 1.5px solid var(--line); font: inherit; background: #fbfcfe; min-height: 48px; }
button.primary { background: var(--navy); color: #fff; border: 1.5px solid var(--navy); padding: 12px 24px; border-radius: 999px; cursor: pointer; font: inherit; font-weight: 700; min-height: 48px; width: 100%; }
button.big { font-size: 1.05rem; }
.error { color: #8a1f1f; font-weight: 700; }
.rootnode { text-align: center; background: linear-gradient(135deg, var(--navy), var(--navy-3)); color: #fff; border-bottom: 5px solid var(--gold); border-radius: 20px; padding: 26px 20px; box-shadow: var(--shadow); }
.rootnode h1 { margin: 4px 0; font-size: 2rem; }
.rootnode .sub { color: var(--gold-soft); }
.kicker { letter-spacing: .08em; text-transform: uppercase; font-weight: 700; color: var(--gold-soft); margin: 0; }
.livedot { color: #7ee2a0; font-weight: 800; }
.stem { width: 4px; height: 30px; background: var(--gold); margin: 0 auto; }
.branches { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px; border-top: 4px solid var(--gold); padding-top: 18px; }
.dept { background: var(--card); border: 1.5px solid var(--line); border-top: 10px solid var(--navy-3); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); text-align: center; }
.dept.approved { border-top-color: var(--gold); }
.dept.active { outline: 3px solid var(--gold-soft); }
.dept h2 { margin: 2px 0 12px; font-size: 1.15rem; }
.official { background: #eef3fa; border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 2px; }
.official.gold { background: #fdf3d7; border: 1.5px solid var(--gold); }
.role { font-size: .78rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--navy-3); }
.name { font-size: 1.15rem; font-weight: 800; color: var(--navy); }
.meta { font-size: .85rem; color: var(--muted); }
.connector { width: 3px; height: 14px; background: var(--navy-3); margin: 0 auto; }
.stamp { color: #1e5c2a; font-weight: 800; margin: 10px 0 0; }
.pending { color: var(--muted); font-weight: 600; margin: 16px 0; }
.foot { text-align: center; color: var(--muted); margin-top: 22px; }
.sub { opacity: .85; }
</style>
