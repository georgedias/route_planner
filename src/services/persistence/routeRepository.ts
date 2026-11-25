import type { RoutePlan } from '../../packages/shared/src/route'

/** Storage boundary: route calculations and the domain model do not depend on persistence. */
export interface RouteRepository {
  loadActiveRoute(): Promise<RoutePlan | null>
  saveActiveRoute(route: RoutePlan): Promise<void>
}
