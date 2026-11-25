import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { APPLICATION_MODE } from './config/runtimeMode'
import { LocalRouteRepository } from './services/persistence/localRouteRepository'
import { useRouteStore } from './stores/routeStore'
import 'maplibre-gl/dist/maplibre-gl.css'
import './style.css'

async function bootstrapApplication() {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)

  // Local mode remains account-free and database-free. Only the active route
  // is restored from this browser; hosted mode will use the authenticated API.
  if (APPLICATION_MODE === 'local') {
    const routeStore = useRouteStore(pinia)
    const repository = new LocalRouteRepository()
    const savedRoute = await repository.loadActiveRoute()

    if (savedRoute) {
      routeStore.$patch({ route: savedRoute })
      routeStore.setNotice(`Restored “${savedRoute.name}” from this browser.`)
    }

    let saveTimer: ReturnType<typeof setTimeout> | undefined
    watch(
      () => routeStore.route,
      (route) => {
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => void repository.saveActiveRoute(route), 250)
      },
      { deep: true, flush: 'post' },
    )
  }

  app.mount('#app')
}

void bootstrapApplication()
