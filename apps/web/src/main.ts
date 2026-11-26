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
    const persistCurrentRoute = () => {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = undefined
      // Snapshot the current Pinia state at call time, not a stale watcher value.
      void repository.saveActiveRoute(routeStore.route)
    }
    watch(
      () => routeStore.route,
      () => {
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(persistCurrentRoute, 200)
      },
      { deep: true, flush: 'post' },
    )
    // Flush pending autosaves when the tab is backgrounded or closed. IndexedDB
    // commits remain asynchronous; the normal debounce is the primary save path.
    window.addEventListener('pagehide', persistCurrentRoute)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persistCurrentRoute()
    })
  }

  app.mount('#app')
}

void bootstrapApplication()
