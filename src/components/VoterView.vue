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
          <label v-for="n in o.nominees" :key="n.id">
            <input type="radio" :name="o.id" :value="n.id" v-model="choices[o.id]" /> {{ n.name }}
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
.wrap { max-width: 640px; margin: 0 auto; padding: 16px; font-family: system-ui, sans-serif; }
label { display: block; margin: 8px 0; }
fieldset { border: 1px solid #ddd; border-radius: 12px; margin: 10px 0; }
button.primary { background: #14532d; color: #fff; border: 1px solid #14532d; padding: 10px 18px; border-radius: 999px; cursor: pointer; }
.sub { opacity: .75; } .ok { background: #f0fdf4; padding: 12px; border-radius: 12px; }
</style>
