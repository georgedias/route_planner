export type Position = [number, number]
export type CheckpointType = 'split' | 'rest' | 'control' | 'finish'
export interface RoutePoint { coordinates: Position; distanceKm: number; elevationM?: number }
export interface RouteCheckpoint {
  id: string
  type: CheckpointType
  name: string
  distanceKm: number
  restDurationMinutes: number
}
export interface RoutePlan {
  id: string
  name: string
  source: 'demo' | 'gpx' | 'tcx' | 'ridewithgps'
  coordinates: Position[]
  elevations: (number | null)[]
  distanceKm: number
  checkpoints: RouteCheckpoint[]
  targetDistanceKm: number
  timeLimitMinutes: number
  averageSpeedKmh: number
  startTime: string
}
