/** GeoJSON position in [longitude, latitude] order. */
export type Position = [number, number]
export type CheckpointType = 'split' | 'rest' | 'aid_station' | 'finish'
export type DistanceUnit = 'km' | 'mi'
export type SpeedMode = 'overall' | 'split'
export type ClockFormat = '12h' | '24h'
export interface RoutePoint { coordinates: Position; distanceKm: number; elevationM?: number }
export interface RouteCheckpoint {
  id: string
  type: CheckpointType
  name: string
  /** Canonical distance from route start, stored in kilometres. */
  distanceKm: number
  /** Planned stop duration at this checkpoint. */
  restDurationMinutes: number
  /** Average speed for the segment ending at this checkpoint, in km/h. */
  averageSpeedKmh?: number
  /** Original imported waypoint location; omitted for manually placed checkpoints. */
  coordinates?: Position
}
/**
 * Persisted route model. Distances are canonical kilometres and speeds are
 * canonical kilometres per hour; UI unit preferences never change storage.
 */
export interface RoutePlan {
  id: string
  name: string
  source: 'demo' | 'gpx' | 'tcx' | 'ridewithgps'
  coordinates: Position[]
  elevations: (number | null)[]
  distanceKm: number
  checkpoints: RouteCheckpoint[]
  /** Canonical target distance, stored in kilometres. */
  targetDistanceKm: number
  timeLimitMinutes: number
  /** Overall speed in km/h; also used as the fallback in overall-speed mode. */
  averageSpeedKmh: number
  speedMode: SpeedMode
  distanceUnit: DistanceUnit
  startTime: string
  /** Local calendar date on which the ride starts, used for weekday estimates. */
  startDate: string
  /** Display preference for estimated arrival and departure times. */
  clockFormat: ClockFormat
}
