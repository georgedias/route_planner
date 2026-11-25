import { API_BASE_URL } from '../../config/runtimeMode'
import type { RoutePlan } from '../../packages/shared/src/route'
import type { RouteRepository } from './routeRepository'

/**
 * Hosted persistence adapter contract. These account-protected endpoints are
 * implemented alongside hosted authentication in the next backend milestone.
 */
export class HostedRouteRepository implements RouteRepository {
  async loadActiveRoute(): Promise<RoutePlan | null> {
    const response = await fetch(`${API_BASE_URL}/routes/active`, {
      credentials: 'include',
    })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`Unable to load the hosted route (${response.status}).`)
    return (await response.json()) as RoutePlan
  }

  async saveActiveRoute(route: RoutePlan): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/routes/active`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(route),
    })
    if (!response.ok) throw new Error(`Unable to save the hosted route (${response.status}).`)
  }
}
