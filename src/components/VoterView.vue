<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { getSession, submitBallot, votedKey, type VoteSession } from '../services/voteBackend'

const props = defineProps<{ code: string }>()
const session = ref<VoteSession | null>(null)
const missing = ref(false)
const done = ref(false)
const already = ref(localStorage.getItem(votedKey(props.code)) === '1')
const choices = reactive<Record<string, string | null>>({})

onMounted(async () => {
  try { session.value = await getSession(props.code) } catch { session.value = null }
  if (!session.value) missing.value = true
})

async function submit() {
  if (!session.value || already.value) return
  await submitBallot(props.code, { ...choices })
  localStorage.setItem(votedKey(props.code), '1')
  already.value = true
  done.value = true
}
const es = () => session.value?.lang === 'es'
</script>

<template>
  <main class="wrap">
    <h1>{{ es() ? 'Votación' : 'Ballot' }} · {{ code }}</h1>
    <p v-if="missing">{{ es() ? 'Sesión no encontrada. Verifica el código con el presidente.' : 'Session not found. Check the code with the chair.' }}</p>
    <template v-else-if="session">
      <h2>{{ session.title }}</h2>
      <p class="sub">{{ session.church }}</p>
      <p v-if="done" class="ok">{{ es() ? 'Voto recibido. Gracias.' : 'Ballot received. Thank you.' }}</p>
      <p v-else-if="already">{{ es() ? 'Este dispositivo ya votó en esta sesión.' : 'This device has already voted in this session.' }}</p>
      <p v-else-if="!session.open">{{ es() ? 'La votación está cerrada.' : 'Voting is closed.' }}</p>
      <template v-else>
        <p>{{ es() ? 'Voto anónimo — su nombre nunca se registra.' : 'Anonymous ballot — your name is never recorded.' }}</p>
        <fieldset v-for="o in session.ballot.offices" :key="o.id">
          <legend>{{ o.department }} — {{ o.role }}</legend>
          <label class="bypick">{{ es() ? 'Seleccionar por número' : 'Select by number' }}
            <select v-model="choices[o.id]">
              <option :value="undefined">—</option>
              <option v-for="(n, ni) in o.nominees" :key="n.id" :value="n.id">{{ n.number ?? ni + 1 }} · {{ n.name }}</option>
              <option :value="null">{{ es() ? 'Abstenerse' : 'Abstain' }}</option>
            </select>
          </label>
          <label v-for="(n, ni) in o.nominees" :key="n.id">
            <input type="radio" :name="o.id" :value="n.id" v-model="choices[o.id]" /> <span class="bignum">{{ n.number ?? ni + 1 }}</span> {{ n.name }}
          </label>
          <label><input type="radio" :name="o.id" :value="null" v-model="choices[o.id]" /> {{ es() ? 'Abstenerse' : 'Abstain' }}</label>
        </fieldset>
        <button class="primary" @click="submit">{{ es() ? 'Emitir voto' : 'Cast ballot' }}</button>
      </template>
    </template>
    <p v-else>…</p>
  </main>
</template>

<style scoped>
.wrap { max-width: 640px; margin: 0 auto; padding: 20px 16px 48px; }
h1 {
  background: linear-gradient(135deg, var(--navy), var(--navy-3)); color: #fff;
  border-bottom: 4px solid var(--gold); border-radius: var(--radius);
  padding: 18px 20px; box-shadow: var(--shadow); font-size: 1.5rem; margin: 0 0 14px;
}
label {
  display: flex; align-items: center; gap: 10px; margin: 10px 0; min-height: 52px;
  background: #fff; border: 1.5px solid var(--line); border-radius: 12px; padding: 12px 14px; font-weight: 500;
}
label:has(input:checked) { border-color: var(--gold); background: #fdf8e7; box-shadow: inset 0 0 0 1px var(--gold); }
input[type='radio'] { width: 22px; height: 22px; accent-color: var(--navy); }
fieldset { border: 1.5px solid var(--line); border-radius: var(--radius); margin: 12px 0; padding: 12px 16px; background: #fbfcfe; }
legend { font-weight: 700; color: var(--navy); padding: 0 6px; }
button.primary {
  background: var(--navy); color: #fff; border: 1.5px solid var(--navy); padding: 12px 22px;
  border-radius: 999px; cursor: pointer; font: inherit; font-weight: 700; min-height: 48px; width: 100%;
}
.bignum { display: inline-grid; place-items: center; min-width: 40px; height: 40px; padding: 0 8px; border-radius: 12px; background: var(--navy); color: var(--gold-soft); font-weight: 800; font-size: 1.15rem; }
.bypick { background: #eef3fa; border-style: dashed; }
select { margin-left: 8px; padding: 10px 12px; border-radius: 10px; border: 1.5px solid var(--line); background: #fff; font: inherit; min-height: 44px; }
.sub { opacity: .8; }
.ok { background: #fdf8e7; border: 1px solid var(--gold); padding: 14px; border-radius: var(--radius); font-weight: 600; }
</style>
