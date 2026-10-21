import { createApp, h, ref } from 'vue'
import './style.css'
import App from './App.vue'
import VoterView from './components/VoterView.vue'
import DashboardView from './components/DashboardView.vue'

// Minimal hash routing:
//   #/vote/<code>                 → voter page (what the QR opens)
//   #/dashboard                   → board dashboard sign-in (Session ID + PIN)
//   #/dashboard/<code>/<id>       → board dashboard, pre-unlocked
const route = ref(window.location.hash)
window.addEventListener('hashchange', () => { route.value = window.location.hash })

const Root = {
  render() {
    const vote = route.value.match(/^#\/vote\/(\d{6})/)
    if (vote) return h(VoterView, { code: vote[1] })
    const dash = route.value.match(/^#\/dashboard(?:\/(\d{6})\/([0-9a-fA-F-]+))?/)
    if (dash) return h(DashboardView, { code: dash[1] || undefined, sessionId: dash[2] || undefined })
    return h(App)
  },
}
createApp(Root).mount('#app')
