import type { Position } from '../types/route'

export interface ParsedWaypoint { name: string; coordinates: Position; category: 'rest' | 'aid_station' }
export interface ParsedRoute { name: string; coordinates: Position[]; elevations: (number | null)[]; waypoints: ParsedWaypoint[]; source: 'gpx' | 'tcx' }

/** Infer a useful checkpoint category from waypoint names and metadata. */
function classifyWaypoint(values: (string | null | undefined)[]): 'rest' | 'aid_station' {
  const text = values.filter(Boolean).join(' ').toLowerCase()
  return /aid|control|checkpoint|water|fuel|feed|supply|hydration|food|caseys|gas station/.test(text) ? 'aid_station' : 'rest'
}

/** Namespace-independent XML lookup for GPX/TCX files. */
function localElements(parent: Document | Element, name: string): Element[] {
  return Array.from(parent.getElementsByTagName('*')).filter(el => el.localName.toLowerCase() === name.toLowerCase())
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
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
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
      const lat = Number(point.getAttribute('lat')); const lon = Number(point.getAttribute('lon'))
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue
      coordinates.push([lon, lat])
      const ele = localText(point, 'ele')
      elevations.push(ele !== null && Number.isFinite(Number(ele)) ? Number(ele) : null)
    }
    const waypoints: ParsedWaypoint[] = localElements(xml, 'wpt').flatMap(point => {
      const lat = Number(point.getAttribute('lat')); const lon = Number(point.getAttribute('lon'))
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return []
      const value = (tag: string) => localText(point, tag)
      const waypointName = value('name') || value('cmt') || value('desc') || 'Imported waypoint'
      return [{ name: waypointName, coordinates: [lon, lat] as Position, category: classifyWaypoint([waypointName, value('type'), value('sym')]) }]
    })
    const name = localText(xml, 'name') || file.name.replace(/\.[^.]+$/, '')
    return { name, coordinates, elevations, waypoints, source: 'gpx' }
  }

  if (root === 'trainingcenterdatabase') {
    // Garmin courses store geometry in Course/Track/Trackpoint. Activity TCX
    // files instead store Trackpoint under Activity/Lap/Track.
    const course = localElements(xml, 'Course')[0]
    const trackpoints = course ? localElements(course, 'Trackpoint') : localElements(xml, 'Trackpoint')
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
    const waypoints: ParsedWaypoint[] = coursepoints.flatMap(point => {
      const pointType = (localText(point, 'PointType') || '').trim().toLowerCase()
      // Turn cues are navigation instructions, not places to stop.
      if (pointType !== 'food' && pointType !== 'generic') return []
      const position = localElements(point, 'Position')[0]
      if (!position) return []
      const coordinate = coordinateFrom(position)
      if (!coordinate) return []
      const waypointName = localText(point, 'Name') || localText(point, 'Notes') || 'Imported waypoint'
      const notes = localText(point, 'Notes')
      // Do not create checkpoints for route boundary markers.
      if (pointType === 'generic' && /(^|\s)(start|end) of (the )?route|end of neutral lead out/i.test(`${waypointName} ${notes || ''}`)) return []
      return [{ name: waypointName, coordinates: coordinate, category: pointType === 'food' ? 'aid_station' : classifyWaypoint([waypointName, notes]) }]
    })
    const name = (course && localText(course, 'Name')) || localText(xml, 'Name') || file.name.replace(/\.[^.]+$/, '')
    return { name, coordinates, elevations, waypoints, source: 'tcx' }
  }
  throw new Error('Unsupported file. Please select a GPX or TCX route.')
}

/** Serialize the current route geometry as a standards-compliant GPX track. */
export function makeGpx(name: string, coordinates: Position[], elevations: (number | null)[]): string {
  const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!))
  const points = coordinates.map(([lon, lat], i) => `      <trkpt lat="${lat}" lon="${lon}">${elevations[i] == null ? '' : `<ele>${elevations[i]}</ele>`}</trkpt>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Endurance Route Planner" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${escape(name)}</name></metadata><trk><name>${escape(name)}</name><trkseg>\n${points}\n    </trkseg></trk></gpx>`
}
