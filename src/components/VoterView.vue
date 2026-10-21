<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getSession, submitBallot, submitSuggestion, votedKey, type VoteSession } from '../services/voteBackend'

// Kahoot-style voter page: follows the host's screen.
// names phase → submit a name · voting phase → tap a NUMBER · results → watch the big screen.
const props = defineProps<{ code: string }>()
const session = ref<VoteSession | null>(null)
const missing = ref(false)
const nameDraft = ref('')
const nameSent = ref(false)
const picked = ref<string | null>(null)
const done = ref(false)
let poll: number | undefined

const closed = computed(() => !!session.value && session.value.open === false)
const dept = computed(() => session.value?.ballot.departments[session.value.ballot.current] || null)
const phase = computed(() => session.value?.ballot.phase || 'names')
const es = computed(() => session.value?.lang === 'es')
const votedFlag = () => dept.value ? localStorage.getItem(votedKey(`${props.code}-${dept.value.id}`)) === '1' : false

async function refresh() {
  try { session.value = await getSession(props.code) } catch { /* keep last */ }
  if (!session.value) missing.value = true
  if (votedFlag()) done.value = true
}
onMounted(() => { refresh(); poll = window.setInterval(refresh, 2500) })
onUnmounted(() => { if (poll) clearInterval(poll) })

async function sendName() {
  const n = nameDraft.value.trim()
  if (!n) return
  await submitSuggestion(props.code, n)
  nameDraft.value = ''
  nameSent.value = true
  await refresh()
}
async function vote(candidateId: string) {
  if (!dept.value || done.value) return
  picked.value = candidateId
  await submitBallot(props.code, { [dept.value.id]: candidateId })
  localStorage.setItem(votedKey(`${props.code}-${dept.value.id}`), '1')
  done.value = true
}
</script>

<template>
  <main class="wrap">
    <h1>{{ session?.title || (es ? 'Elección de la Iglesia' : 'Church Election') }}</h1>
    <p v-if="missing">{{ es ? 'Sesión no encontrada. Verifica el código con el pastor.' : 'Session not found. Check the code with the pastor.' }}</p>
    <p v-else-if="closed" class="ok">{{ es ? 'Esta sesión se cerró o el PIN cambió. Pide al pastor el código nuevo.' : 'This session was closed or the PIN changed. Ask the pastor for the new code.' }}</p>
    <template v-else-if="session && dept">
      <p class="dept">{{ dept.name }}</p>

      <!-- NAMES -->
      <template v-if="phase === 'names'">
        <h2>{{ es ? 'Enviar un nombre' : 'Submit a name' }}</h2>
        <p class="sub">{{ es ? 'El pastor o la secretaria lo agregará a la lista con un número.' : 'The pastor or secretary will add it to the list with a number.' }}</p>
        <p v-if="nameSent" class="ok">{{ es ? 'Nombre enviado. Puedes enviar otro.' : 'Name sent. You can send another.' }}</p>
        <input v-model="nameDraft" :placeholder="es ? 'Nombre del candidato' : 'Candidate name'" @keyup.enter="sendName" />
        <button class="primary" @click="sendName">{{ es ? 'Enviar' : 'Submit' }}</button>
        <h3>{{ es ? 'Lista hasta ahora' : 'List so far' }}</h3>
        <ol class="list">
          <li v-for="(c, i) in dept.candidates" :key="c.id"><span class="bignum">{{ i + 1 }}</span> {{ c.name }}</li>
        </ol>
        <p v-if="!dept.candidates.length" class="sub">{{ es ? 'Aún no hay nombres.' : 'No names yet.' }}</p>
      </template>

      <!-- VOTING: tap a number -->
      <template v-else-if="phase === 'voting'">
        <h2>{{ es ? 'Toca un número para votar' : 'Tap a number to vote' }}</h2>
        <ol class="list biglist">
          <li v-for="(c, i) in dept.candidates" :key="c.id"><span class="bignum">{{ i + 1 }}</span> <strong class="cname">{{ c.name }}</strong></li>
        </ol>
        <p v-if="done" class="ok">{{ es ? 'Voto recibido. Gracias.' : 'Vote received. Thank you.' }}</p>
        <div v-else class="grid">
          <button v-for="(c, i) in dept.candidates" :key="c.id" class="tile" :class="{ picked: picked === c.id }" @click="vote(c.id)">
            <span class="n">{{ i + 1 }}</span>
            <span class="nm">{{ c.name }}</span>
          </button>
        </div>
        <p class="sub">{{ es ? 'Anónimo — tu nombre nunca se registra.' : 'Anonymous — your name is never recorded.' }}</p>
      </template>

      <!-- RESULTS / DONE -->
      <template v-else>
        <p class="ok">{{ es ? 'Votación cerrada — mira los resultados en la pantalla principal.' : 'Voting closed — watch the results on the main screen.' }}</p>
      </template>
    </template>
    <p v-else>…</p>
  </main>
</template>

<style scoped>
.wrap { max-width: 640px; margin: 0 auto; padding: 20px 16px 48px; }
h1 { background: linear-gradient(135deg, var(--navy), var(--navy-3)); color: #fff; border-bottom: 4px solid var(--gold); border-radius: var(--radius); padding: 18px 20px; box-shadow: var(--shadow); font-size: 1.4rem; margin: 0 0 12px; }
.dept { font-size: 1.8rem; font-weight: 800; color: var(--navy); text-align: center; margin: 10px 0; }
input { width: 100%; padding: 12px; border-radius: 10px; border: 1.5px solid var(--line); font: inherit; margin: 8px 0; background: #fff; }
button.primary { background: var(--navy); color: #fff; border: 1.5px solid var(--navy); padding: 12px 22px; border-radius: 999px; cursor: pointer; font: inherit; font-weight: 700; min-height: 48px; width: 100%; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 14px 0; }
.tile { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px 10px; border-radius: 16px; border: 2px solid var(--line); background: #fff; cursor: pointer; font: inherit; box-shadow: var(--shadow); }
.tile .n { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%; background: var(--navy); color: var(--gold-soft); font-size: 1.7rem; font-weight: 800; }
.tile .nm { font-weight: 700; color: #16233a; text-align: center; font-size: 1.12rem; line-height: 1.25; }
.tile:active, .tile.picked { border-color: var(--gold); background: #fdf8e7; }
.list { list-style: none; padding: 0; }
.list li { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 1.1rem; }
.biglist li { font-size: 1.3rem; padding: 12px 0; }
.cname { color: #16233a; }
.bignum { display: inline-grid; place-items: center; min-width: 40px; height: 40px; border-radius: 12px; background: var(--navy); color: var(--gold-soft); font-weight: 800; }
.sub { opacity: .8; }
.ok { background: #fdf8e7; border: 1px solid var(--gold); padding: 14px; border-radius: var(--radius); font-weight: 600; }
</style>
