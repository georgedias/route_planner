import type { RoutePlan } from '../../packages/shared/src/route'
import type { RouteRepository } from './routeRepository'

const DATABASE_NAME = 'endurance-route-planner'
const DATABASE_VERSION = 1
const STORE_NAME = 'workspace'
const ACTIVE_ROUTE_KEY = 'active-route'
const LOCAL_STORAGE_KEY = 'endurance-route-planner:active-route'

/**
 * Browser-only persistence for standalone mode. IndexedDB is used for route
 * geometry because imported GPX/TCX tracks can exceed localStorage's small
 * synchronous quota. localStorage remains a fallback for restricted browsers.
 */
export class LocalRouteRepository implements RouteRepository {
  private databasePromise?: Promise<IDBDatabase>

  async loadActiveRoute(): Promise<RoutePlan | null> {
    try {
      if (typeof indexedDB === 'undefined') return this.loadFallback()
      const database = await this.openDatabase()
      return await new Promise<RoutePlan | null>((resolve, reject) => {
        const request = database
          .transaction(STORE_NAME, 'readonly')
          .objectStore(STORE_NAME)
          .get(ACTIVE_ROUTE_KEY)
        request.onsuccess = () => resolve((request.result as RoutePlan | undefined) ?? null)
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      console.warn('IndexedDB could not load the saved route; trying browser storage.', error)
      return this.loadFallback()
    }
  }

  async saveActiveRoute(route: RoutePlan): Promise<void> {
    // JSON serialization removes Vue's reactive proxies before structured storage.
    const snapshot = JSON.parse(JSON.stringify(route)) as RoutePlan

    try {
      if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable.')
      const database = await this.openDatabase()
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite')
        transaction.objectStore(STORE_NAME).put(snapshot, ACTIVE_ROUTE_KEY)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
    } catch (error) {
      console.warn('IndexedDB could not save the route; trying browser storage.', error)
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(snapshot))
      } catch (fallbackError) {
        console.error('Unable to persist the local route in this browser.', fallbackError)
      }
    }
  }

  private loadFallback(): RoutePlan | null {
    try {
      const value = localStorage.getItem(LOCAL_STORAGE_KEY)
      return value ? (JSON.parse(value) as RoutePlan) : null
    } catch (error) {
      console.warn('Unable to read the browser-storage route backup.', error)
      return null
    }
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise

    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('The local route database is blocked by another tab.'))
    })

    return this.databasePromise
  }
}
