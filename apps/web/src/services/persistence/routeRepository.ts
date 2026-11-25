import type { RoutePlan } from '@endurance-route-planner/shared'

/** Storage boundary: route calculations and the domain model do not depend on persistence. */
export interface RouteRepository {
  loadActiveRoute(): Promise<RoutePlan | null>
  saveActiveRoute(route: RoutePlan): Promise<void>
}
