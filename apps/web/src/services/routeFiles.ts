import { along, length, lineString } from '@turf/turf'
import type { Position, CheckpointType, RouteCheckpoint, RoutePlan } from '../types/route'

export interface ParsedWaypoint {
  name: string
  coordinates: Position
  category: 'rest' | 'aid_station'
  checkpointType?: CheckpointType
  distanceKm?: number
  restDurationMinutes?: number
  averageSpeedKmh?: number
}
export type ImportedPlannerSettings = Pick<
  RoutePlan,
  | 'targetDistanceKm'
  | 'timeLimitMinutes'
  | 'averageSpeedKmh'
  | 'speedMode'
  | 'distanceUnit'
  | 'startDate'
  | 'startTime'
  | 'clockFormat'
>
export interface ParsedRoute {
  name: string
  coordinates: Position[]
  elevations: (number | null)[]
  waypoints: ParsedWaypoint[]
  source: 'gpx' | 'tcx'
  plannerSettings?: Partial<ImportedPlannerSettings>
}

/** Infer a useful checkpoint category from waypoint names and metadata. */
function classifyWaypoint(values: (string | null | undefined)[]): 'rest' | 'aid_station' {
  const text = values.filter(Boolean).join(' ').toLowerCase()
  return /aid|control|checkpoint|water|fuel|feed|supply|hydration|food|caseys|gas station/.test(
    text,
  )
    ? 'aid_station'
    : 'rest'
}

/** Namespace-independent XML lookup for GPX/TCX files. */
function localElements(parent: Document | Element, name: string): Element[] {
  return Array.from(parent.getElementsByTagName('*')).filter(
    (el) => el.localName.toLowerCase() === name.toLowerCase(),
  )
}
function localText(parent: Document | Element, name: string): string | null {
  return localElements(parent, name)[0]?.textContent?.trim() || null
}
/** Read and validate a TCX Position element, returning GeoJSON [lon, lat]. */
function coordinateFrom(parent: Element): Position | null {
  const latText = localText(parent, 'LatitudeDegrees')
  const lonText = localText(parent, 'LongitudeDegrees')
  if (latText === null || lonText === null) return null
  const lat = Number(latText)
  const lon = Number(lonText)
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  )
    return null
  return [lon, lat]
}

export async function parseRouteFile(file: File): Promise<ParsedRoute> {
  const text = await file.text()
  const xml = new DOMParser().parseFromString(text, 'application/xml')
  if (xml.querySelector('parsererror')) throw new Error('This file is not valid GPX or TCX XML.')
  const root = xml.documentElement.localName.toLowerCase()

  // GPX route geometry comes from track/route points; named wpt elements are
  // kept separately as checkpoint candidates.
  if (root === 'gpx') {
    const points = [...localElements(xml, 'trkpt'), ...localElements(xml, 'rtept')]
    const coordinates: Position[] = []
    const elevations: (number | null)[] = []
    for (const point of points) {
      const lat = Number(point.getAttribute('lat'))
      const lon = Number(point.getAttribute('lon'))
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
      )
        continue
      coordinates.push([lon, lat])
      const ele = localText(point, 'ele')
      elevations.push(ele !== null && Number.isFinite(Number(ele)) ? Number(ele) : null)
    }
    const waypoints: ParsedWaypoint[] = localElements(xml, 'wpt').flatMap((point) => {
      const lat = Number(point.getAttribute('lat'))
      const lon = Number(point.getAttribute('lon'))
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
      )
        return []
      const value = (tag: string) => localText(point, tag)
      const waypointName = value('name') || value('cmt') || value('desc') || 'Imported waypoint'
      const extensionText = (tag: string) =>
        localElements(point, tag)[0]?.textContent?.trim() || null
      const checkpointTypeText = extensionText('checkpointType')
      const validTypes: CheckpointType[] = ['split', 'rest', 'aid_station', 'finish']
      const checkpointType = validTypes.includes(checkpointTypeText as CheckpointType)
        ? (checkpointTypeText as CheckpointType)
        : undefined
      const numericExtension = (tag: string) => {
        const raw = extensionText(tag)
        if (raw === null) return undefined
        const n = Number(raw)
        return Number.isFinite(n) ? n : undefined
      }
      return [
        {
          name: waypointName,
          coordinates: [lon, lat] as Position,
          category:
            checkpointType === 'rest'
              ? 'rest'
              : checkpointType === 'aid_station'
                ? 'aid_station'
                : classifyWaypoint([waypointName, value('type'), value('sym')]),
          checkpointType,
          distanceKm: numericExtension('distanceKm'),
          restDurationMinutes: numericExtension('restDurationMinutes'),
          averageSpeedKmh: numericExtension('averageSpeedKmh'),
        },
      ]
    })
    const name = localText(xml, 'name') || file.name.replace(/\.[^.]+$/, '')
    // Planner settings live in a namespaced GPX metadata extension. Keep this
    // optional so ordinary third-party GPX files remain fully supported.
    const metadata = localElements(xml, 'metadata')[0]
    const planner = metadata ? localElements(metadata, 'plannerSettings')[0] : undefined
    const settingText = (tag: string) =>
      planner ? localElements(planner, tag)[0]?.textContent?.trim() || undefined : undefined
    const settingNumber = (tag: string, minimum = 0) => {
      const raw = settingText(tag)
      if (raw === undefined) return undefined
      const value = Number(raw)
      return Number.isFinite(value) && value >= minimum ? value : undefined
    }
    const startDate = settingText('startDate')
    const startTime = settingText('startTime')
    const speedMode = settingText('speedMode')
    const distanceUnit = settingText('distanceUnit')
    const clockFormat = settingText('clockFormat')
    const plannerSettings: Partial<ImportedPlannerSettings> = {}
    const targetDistanceKm = settingNumber('targetDistanceKm', 0.001)
    const timeLimitMinutes = settingNumber('timeLimitMinutes', 0.001)
    const averageSpeedKmh = settingNumber('averageSpeedKmh', 0.001)
    if (targetDistanceKm !== undefined) plannerSettings.targetDistanceKm = targetDistanceKm
    if (timeLimitMinutes !== undefined) plannerSettings.timeLimitMinutes = timeLimitMinutes
    if (averageSpeedKmh !== undefined) plannerSettings.averageSpeedKmh = averageSpeedKmh
    if (speedMode === 'overall' || speedMode === 'split') plannerSettings.speedMode = speedMode
    if (distanceUnit === 'km' || distanceUnit === 'mi') plannerSettings.distanceUnit = distanceUnit
    if (
      startDate &&
      /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
      !Number.isNaN(Date.parse(`${startDate}T00:00:00`))
    )
      plannerSettings.startDate = startDate
    if (startTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime))
      plannerSettings.startTime = startTime
    if (clockFormat === '12h' || clockFormat === '24h') plannerSettings.clockFormat = clockFormat
    return {
      name,
      coordinates,
      elevations,
      waypoints,
      source: 'gpx',
      plannerSettings: Object.keys(plannerSettings).length ? plannerSettings : undefined,
    }
  }

  if (root === 'trainingcenterdatabase') {
    // Garmin courses store geometry in Course/Track/Trackpoint. Activity TCX
    // files instead store Trackpoint under Activity/Lap/Track.
    const course = localElements(xml, 'Course')[0]
    const trackpoints = course
      ? localElements(course, 'Trackpoint')
      : localElements(xml, 'Trackpoint')
    const coordinates: Position[] = []
    const elevations: (number | null)[] = []
    for (const point of trackpoints) {
      const position = localElements(point, 'Position')[0]
      if (!position) continue
      const coordinate = coordinateFrom(position)
      if (!coordinate) continue
      coordinates.push(coordinate)
      const ele = localText(point, 'AltitudeMeters')
      elevations.push(ele !== null && Number.isFinite(Number(ele)) ? Number(ele) : null)
    }

    // Garmin CoursePoints include both real stops and turn-by-turn cues. Only
    // Food and Generic points can become checkpoints; directional cues are skipped.
    const coursepoints = course ? localElements(course, 'CoursePoint') : []
    const waypoints: ParsedWaypoint[] = coursepoints.flatMap((point) => {
      const pointType = (localText(point, 'PointType') || '').trim().toLowerCase()
      // Turn cues are navigation instructions, not places to stop.
      if (pointType !== 'food' && pointType !== 'generic') return []
      const position = localElements(point, 'Position')[0]
      if (!position) return []
      const coordinate = coordinateFrom(position)
      if (!coordinate) return []
      const waypointName =
        localText(point, 'Name') || localText(point, 'Notes') || 'Imported waypoint'
      const notes = localText(point, 'Notes')
      // Do not create checkpoints for route boundary markers.
      if (
        pointType === 'generic' &&
        /(^|\s)(start|end) of (the )?route|end of neutral lead out/i.test(
          `${waypointName} ${notes || ''}`,
        )
      )
        return []
      return [
        {
          name: waypointName,
          coordinates: coordinate,
          category: pointType === 'food' ? 'aid_station' : classifyWaypoint([waypointName, notes]),
        },
      ]
    })
    const name =
      (course && localText(course, 'Name')) ||
      localText(xml, 'Name') ||
      file.name.replace(/\.[^.]+$/, '')
    return { name, coordinates, elevations, waypoints, source: 'tcx' }
  }
  throw new Error('Unsupported file. Please select a GPX or TCX route.')
}

/**
 * Serialize route geometry and planning checkpoints as GPX waypoints.
 * Standard GPX consumers can read the waypoint names/coordinates; this app's
 * namespace preserves checkpoint type, planned distance, stop duration and speed.
 */
export function makeGpx(
  name: string,
  coordinates: Position[],
  elevations: (number | null)[],
  checkpoints: RouteCheckpoint[] = [],
  settings?: ImportedPlannerSettings,
): string {
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
    )
  const points = coordinates
    .map(
      ([lon, lat], i) =>
        `      <trkpt lat="${lat}" lon="${lon}">${elevations[i] == null ? '' : `<ele>${elevations[i]}</ele>`}</trkpt>`,
    )
    .join('\n')
  const routeLine = coordinates.length >= 2 ? lineString(coordinates) : null
  const routeLengthKm = routeLine ? length(routeLine, { units: 'kilometers' }) : 0
  const waypointXml = checkpoints
    .map((cp) => {
      const position =
        cp.coordinates ??
        (routeLine
          ? (along(routeLine, Math.max(0, Math.min(cp.distanceKm, routeLengthKm)), {
              units: 'kilometers',
            }).geometry.coordinates as Position)
          : null)
      if (!position) return ''
      const [lon, lat] = position
      return `  <wpt lat="${lat}" lon="${lon}"><name>${escape(cp.name)}</name><type>${cp.type}</type><extensions><erp:checkpointType>${cp.type}</erp:checkpointType><erp:distanceKm>${cp.distanceKm}</erp:distanceKm><erp:restDurationMinutes>${cp.restDurationMinutes}</erp:restDurationMinutes>${cp.averageSpeedKmh == null ? '' : `<erp:averageSpeedKmh>${cp.averageSpeedKmh}</erp:averageSpeedKmh>`}</extensions></wpt>`
    })
    .filter(Boolean)
    .join('\n')
  const plannerSettingsXml = settings
    ? `<extensions><erp:plannerSettings version="1"><erp:targetDistanceKm>${settings.targetDistanceKm}</erp:targetDistanceKm><erp:timeLimitMinutes>${settings.timeLimitMinutes}</erp:timeLimitMinutes><erp:averageSpeedKmh>${settings.averageSpeedKmh}</erp:averageSpeedKmh><erp:speedMode>${settings.speedMode}</erp:speedMode><erp:distanceUnit>${settings.distanceUnit}</erp:distanceUnit><erp:startDate>${escape(settings.startDate)}</erp:startDate><erp:startTime>${escape(settings.startTime)}</erp:startTime><erp:clockFormat>${settings.clockFormat}</erp:clockFormat></erp:plannerSettings></extensions>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Endurance Route Planner" xmlns="http://www.topografix.com/GPX/1/1" xmlns:erp="https://endurance-route-planner.app/xml/checkpoint/1"><metadata><name>${escape(name)}</name>${plannerSettingsXml}</metadata>${waypointXml ? `\n${waypointXml}` : ''}<trk><name>${escape(name)}</name><trkseg>\n${points}\n    </trkseg></trk></gpx>`
}
