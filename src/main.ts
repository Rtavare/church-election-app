import { createApp, h, ref } from 'vue'
import './style.css'
import App from './App.vue'
import VoterView from './components/VoterView.vue'

// Minimal hash routing: #/vote/<code> is the voter's page (what the QR opens).
const route = ref(window.location.hash)
window.addEventListener('hashchange', () => { route.value = window.location.hash })

const Root = {
  render() {
    const m = route.value.match(/^#\/vote\/(\d{6})/)
    return m ? h(VoterView, { code: m[1] }) : h(App)
  },
}
createApp(Root).mount('#app')
