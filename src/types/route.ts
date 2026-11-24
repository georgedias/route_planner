export type Position = [number, number]
export type CheckpointType = 'split' | 'rest' | 'aid_station' | 'finish'
export type DistanceUnit = 'km' | 'mi'
export type SpeedMode = 'overall' | 'split'
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
}
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
}
