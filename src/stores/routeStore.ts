import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { along, length, lineString, nearestPointOnLine } from '@turf/turf'
import type { DistanceUnit, Position, RouteCheckpoint, RoutePlan } from '../types/route'
import { parseRouteFile } from '../services/routeFiles'
import { APP_CONFIG, DEFAULT_ESTIMATED_SPEED_KMH, KM_PER_MILE } from '../config/appConfig'
const demoCoordinates: Position[] = [
  [-92.25, 37.83],
  [-92.2, 37.87],
  [-92.14, 37.9],
  [-92.08, 37.91],
  [-92.02, 37.95],
  [-91.96, 37.98],
  [-91.9, 38.01],
  [-91.84, 38.04],
  [-91.78, 38.07],
  [-91.72, 38.1],
  [-91.66, 38.14],
  [-91.6, 38.17],
  [-91.54, 38.2],
  [-91.48, 38.23],
  [-91.42, 38.26],
  [-91.36, 38.29],
  [-91.3, 38.32],
  [-91.24, 38.35],
  [-91.18, 38.38],
  [-91.12, 38.41],
]
// Measure the sample route with Turf so demo calculations use the same geometry model as imports.
const DEMO_ROUTE_DISTANCE_KM = length(lineString(demoCoordinates), { units: 'kilometers' })
const localDateString = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// randomUUID() is only available in secure browser contexts in some browsers.
// Check for it, but keep imports working on local/LAN HTTP deployments too.
function createCheckpointId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

export const useRouteStore = defineStore('route', () => {
  const route = ref<RoutePlan>({
    id: 'demo-route',
    name: 'Ozark Century Challenge',
    source: 'demo',
    coordinates: demoCoordinates,
    elevations: demoCoordinates.map(
      (_, i) => 210 + Math.round(95 * Math.abs(Math.sin(i * 1.4)) + 30 * Math.sin(i * 0.45)),
    ),
    distanceKm: 0,
    targetDistanceKm: DEMO_ROUTE_DISTANCE_KM,
    timeLimitMinutes: (DEMO_ROUTE_DISTANCE_KM / DEFAULT_ESTIMATED_SPEED_KMH) * 60,
    averageSpeedKmh: DEFAULT_ESTIMATED_SPEED_KMH,
    speedMode: 'overall',
    distanceUnit: APP_CONFIG.defaultDistanceUnit,
    startTime: '07:00',
    startDate: localDateString(),
    clockFormat: '12h',
    checkpoints: [
      {
        id: 'cp-1',
        type: 'split',
        name: 'Split 1',
        distanceKm: 40,
        restDurationMinutes: 0,
        averageSpeedKmh: 23,
      },
      {
        id: 'cp-2',
        type: 'rest',
        name: 'Convenience Store',
        distanceKm: 75,
        restDurationMinutes: 20,
      },
      {
        id: 'cp-3',
        type: 'split',
        name: 'Split 2',
        distanceKm: 120,
        restDurationMinutes: 0,
        averageSpeedKmh: 21,
      },
      {
        id: 'cp-finish',
        type: 'finish',
        name: 'Finish',
        distanceKm: DEMO_ROUTE_DISTANCE_KM,
        restDurationMinutes: 0,
        averageSpeedKmh: 22,
      },
    ],
  })
  const notice = ref('Demo route loaded. Import a GPX or TCX file to plan your own ride.')
  const error = ref('')
  const line = computed(() =>
    route.value.coordinates.length >= 2 ? lineString(route.value.coordinates) : null,
  )
  // Always derive route length from the actual line geometry; never from the editable target.
  const distanceKm = computed(() => (line.value ? length(line.value, { units: 'kilometers' }) : 0))
  const distanceSyncDifferenceKm = computed(() => route.value.targetDistanceKm - distanceKm.value)
  // Target distance is displayed/entered to 2 decimal places. Treat a value
  // that differs only by display rounding as synchronized.
  const targetDisplayToleranceKm = () =>
    0.005 * (route.value.distanceUnit === 'mi' ? KM_PER_MILE : 1)
  const targetOutOfSync = computed(
    () => Math.abs(distanceSyncDifferenceKm.value) > targetDisplayToleranceKm(),
  )
  const orderedCheckpoints = computed(() =>
    [...route.value.checkpoints].sort((a, b) => a.distanceKm - b.distanceKm),
  )
  // Build one row per checkpoint. Each row describes the leg from the previous
  // checkpoint to this one, with the speed selected for that leg.
  const segmentRows = computed(() => {
    let previousKm = 0
    return orderedCheckpoints.value.map((cp) => {
      const segmentDistanceKm = Math.max(0, cp.distanceKm - previousKm)
      previousKm = cp.distanceKm
      const speedKmh =
        route.value.speedMode === 'split'
          ? cp.averageSpeedKmh && cp.averageSpeedKmh > 0
            ? cp.averageSpeedKmh
            : route.value.averageSpeedKmh
          : route.value.averageSpeedKmh
      return {
        checkpoint: cp,
        segmentDistanceKm,
        speedKmh,
        ridingMinutes: speedKmh > 0 ? (segmentDistanceKm / speedKmh) * 60 : 0,
      }
    })
  })
  const rideMinutes = computed(() => {
    const planned = segmentRows.value.reduce((sum, row) => sum + row.ridingMinutes, 0)
    const coveredKm = segmentRows.value.reduce((sum, row) => sum + row.segmentDistanceKm, 0)
    const remainingKm = Math.max(0, distanceKm.value - coveredKm)
    return (
      planned +
      (route.value.averageSpeedKmh > 0 ? (remainingKm / route.value.averageSpeedKmh) * 60 : 0)
    )
  })
  const restMinutes = computed(() =>
    route.value.checkpoints.reduce((sum, cp) => sum + Math.max(0, cp.restDurationMinutes), 0),
  )
  const totalMinutes = computed(() => rideMinutes.value + restMinutes.value)
  /** Elapsed average includes all planned checkpoint dwell time. */
  const elapsedAverageSpeedKmh = computed(() =>
    totalMinutes.value > 0 ? route.value.targetDistanceKm / (totalMinutes.value / 60) : 0,
  )
  /** Riding average excludes stop time and reflects the selected segment plan. */
  const ridingAverageSpeedKmh = computed(() =>
    rideMinutes.value > 0 ? route.value.targetDistanceKm / (rideMinutes.value / 60) : 0,
  )
  const onTime = computed(() => totalMinutes.value <= route.value.timeLimitMinutes)
  const distanceWithinTarget = computed(
    () =>
      distanceKm.value <=
      route.value.targetDistanceKm + (route.value.distanceUnit === 'mi' ? 0.5 * KM_PER_MILE : 0.5),
  )
  const withinConstraints = computed(() => onTime.value && distanceWithinTarget.value)
  const remainingMinutes = computed(() => route.value.timeLimitMinutes - totalMinutes.value)

  // Unit conversion happens at the store/UI boundary. Persisted route values
  // remain kilometres and km/h regardless of the selected display preference.
  function toKm(value: number, unit: DistanceUnit = route.value.distanceUnit) {
    return unit === 'mi' ? value * KM_PER_MILE : value
  }
  function fromKm(value: number, unit: DistanceUnit = route.value.distanceUnit) {
    return unit === 'mi' ? value / KM_PER_MILE : value
  }
  function speedToKmh(value: number, unit: DistanceUnit = route.value.distanceUnit) {
    return unit === 'mi' ? value * KM_PER_MILE : value
  }
  function speedFromKmh(value: number, unit: DistanceUnit = route.value.distanceUnit) {
    return unit === 'mi' ? value / KM_PER_MILE : value
  }
  function setDistanceUnit(unit: DistanceUnit) {
    route.value.distanceUnit = unit
  }
  function pointAt(km: number): Position {
    if (!line.value) return [0, 0]
    const bounded = Math.max(0, Math.min(km, distanceKm.value))
    return along(line.value, bounded, { units: 'kilometers' }).geometry.coordinates as Position
  }
  // Keep non-Finish checkpoints within the imported geometry and always anchor
  // the Finish checkpoint to the user-selected target distance.
  function normalizeCheckpoints() {
    route.value.checkpoints = route.value.checkpoints
      .map((cp) => ({
        ...cp,
        distanceKm:
          cp.type === 'finish'
            ? route.value.targetDistanceKm
            : Math.max(0, Math.min(cp.distanceKm, distanceKm.value)),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
    route.value.distanceKm = distanceKm.value
  }
  function setTargetDistanceKm(value: number) {
    if (!Number.isFinite(value) || value < 0) return
    // Replace the array and Finish object so every dependent Vue computed/view
    // (including the one-row checkpoint table) receives an explicit update.
    const targetValue =
      Math.abs(value - distanceKm.value) <= targetDisplayToleranceKm() ? distanceKm.value : value
    route.value.targetDistanceKm = targetValue
    const hasFinish = route.value.checkpoints.some((cp) => cp.type === 'finish')
    route.value.checkpoints = route.value.checkpoints.map((cp) =>
      cp.type === 'finish' ? { ...cp, distanceKm: targetValue } : cp,
    )
    if (!hasFinish) {
      const finish: RouteCheckpoint = {
        id: createCheckpointId(),
        type: 'finish',
        name: 'Finish',
        distanceKm: targetValue,
        restDurationMinutes: 0,
        averageSpeedKmh: route.value.averageSpeedKmh,
      }
      route.value.checkpoints = [...route.value.checkpoints, finish]
    }
    route.value.checkpoints.sort((a, b) => a.distanceKm - b.distanceKm)
  }
  function addCheckpoint(type: 'split' | 'rest' | 'aid_station', km = distanceKm.value * 0.5) {
    const count = route.value.checkpoints.filter((c) => c.type === type).length + 1
    const name =
      type === 'rest'
        ? `Rest Stop ${count}`
        : type === 'aid_station'
          ? `Aid Station ${count}`
          : `Split ${count}`
    route.value.checkpoints.push({
      id: createCheckpointId(),
      type,
      name,
      distanceKm: Math.max(0, Math.min(km, distanceKm.value)),
      restDurationMinutes: type === 'rest' || type === 'aid_station' ? 15 : 0,
      averageSpeedKmh: route.value.averageSpeedKmh,
    })
    normalizeCheckpoints()
  }
  function removeCheckpoint(id: string) {
    route.value.checkpoints = route.value.checkpoints.filter((c) => c.id !== id)
  }
  function updateCheckpoint(cp: RouteCheckpoint) {
    const i = route.value.checkpoints.findIndex((c) => c.id === cp.id)
    if (i >= 0) route.value.checkpoints[i] = { ...cp }
    normalizeCheckpoints()
  }
  // Parse a GPX/TCX file, retain its original geometry and waypoint labels,
  // then replace the active route and its checkpoints as one reactive update.
  async function importFile(file: File) {
    error.value = ''
    try {
      const parsed = await parseRouteFile(file)
      if (parsed.coordinates.length < 2)
        throw new Error('The file contains fewer than two usable track points.')
      const importedDistance = length(lineString(parsed.coordinates), { units: 'kilometers' })
      // Build imported checkpoints before replacing the route. This includes
      // every supported stop waypoint from the file, plus a single Finish.
      const importedLine = lineString(parsed.coordinates)
      const waypointCheckpoints: RouteCheckpoint[] = parsed.waypoints.map((waypoint, index) => {
        const snapped = nearestPointOnLine(importedLine, waypoint.coordinates, {
          units: 'kilometers',
        })
        const snappedLocation = Number(snapped.properties.location)
        const distanceKm = Number.isFinite(snappedLocation)
          ? Math.max(0, Math.min(importedDistance, snappedLocation))
          : 0
        const type = waypoint.category
        return {
          id: createCheckpointId(),
          type,
          name: waypoint.name || `${type === 'rest' ? 'Rest Stop' : 'Aid Station'} ${index + 1}`,
          distanceKm,
          restDurationMinutes: type === 'rest' ? 15 : 0,
          averageSpeedKmh: DEFAULT_ESTIMATED_SPEED_KMH,
          coordinates: waypoint.coordinates,
        }
      })
      const checkpoints: RouteCheckpoint[] = [
        ...waypointCheckpoints,
        {
          id: createCheckpointId(),
          type: 'finish' as const,
          name: 'Finish',
          distanceKm: importedDistance,
          restDurationMinutes: 0,
          averageSpeedKmh: DEFAULT_ESTIMATED_SPEED_KMH,
        },
      ].sort((a, b) => a.distanceKm - b.distanceKm)

      // Replace the complete route object in one reactive assignment. This
      // guarantees the sidebar and checkpoint table see the new checkpoint
      // collection rather than retaining stale rows from the previous route.
      route.value = {
        ...route.value,
        name: parsed.name,
        source: parsed.source,
        coordinates: parsed.coordinates,
        elevations: parsed.elevations,
        distanceKm: importedDistance,
        targetDistanceKm: importedDistance,
        averageSpeedKmh: DEFAULT_ESTIMATED_SPEED_KMH,
        timeLimitMinutes: (importedDistance / DEFAULT_ESTIMATED_SPEED_KMH) * 60,
        speedMode: 'overall',
        checkpoints,
      }
      const importedDisplayDistance = fromKm(importedDistance).toFixed(2)
      const estimatedHours = (importedDistance / DEFAULT_ESTIMATED_SPEED_KMH).toFixed(2)
      notice.value = `Imported ${file.name} · ${importedDisplayDistance} ${route.value.distanceUnit} · estimated ${estimatedHours} hours at ${APP_CONFIG.estimatedTravelSpeedMph} mph · ${waypointCheckpoints.length} waypoint${waypointCheckpoints.length === 1 ? '' : 's'} added as checkpoints.`
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unable to import this route.'
    }
  }
  function setNotice(message: string) {
    notice.value = message
  }
  return {
    route,
    notice,
    error,
    line,
    distanceKm,
    distanceSyncDifferenceKm,
    targetOutOfSync,
    setTargetDistanceKm,
    orderedCheckpoints,
    segmentRows,
    rideMinutes,
    restMinutes,
    totalMinutes,
    elapsedAverageSpeedKmh,
    ridingAverageSpeedKmh,
    onTime,
    distanceWithinTarget,
    withinConstraints,
    remainingMinutes,
    toKm,
    fromKm,
    speedToKmh,
    speedFromKmh,
    setDistanceUnit,
    pointAt,
    addCheckpoint,
    removeCheckpoint,
    updateCheckpoint,
    importFile,
    setNotice,
  }
})
