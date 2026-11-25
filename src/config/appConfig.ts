import type { DistanceUnit } from '../types/route'

/** Central defaults for route planning; adjust these without changing import logic. */
export const APP_CONFIG = {
  defaultDistanceUnit: 'mi' as DistanceUnit,
  estimatedTravelSpeedMph: 10,
} as const

/** Exact international mile-to-kilometre conversion used at UI boundaries. */
export const KM_PER_MILE = 1.609344
export const DEFAULT_ESTIMATED_SPEED_KMH = APP_CONFIG.estimatedTravelSpeedMph * KM_PER_MILE
