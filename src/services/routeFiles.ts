import type { Position } from '../types/route'

export interface ParsedRoute { name: string; coordinates: Position[]; elevations: (number | null)[]; source: 'gpx' | 'tcx' }

export async function parseRouteFile(file: File): Promise<ParsedRoute> {
  const text = await file.text()
  const xml = new DOMParser().parseFromString(text, 'application/xml')
  if (xml.querySelector('parsererror')) throw new Error('This file is not valid GPX or TCX XML.')
  const root = xml.documentElement.localName.toLowerCase()
  if (root === 'gpx') {
    const points = [...xml.getElementsByTagName('trkpt'), ...xml.getElementsByTagName('rtept')]
    const coordinates: Position[] = []
    const elevations: (number | null)[] = []
    for (const point of points) {
      const lat = Number(point.getAttribute('lat')); const lon = Number(point.getAttribute('lon'))
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
      coordinates.push([lon, lat]); const ele = point.getElementsByTagName('ele')[0]?.textContent
      elevations.push(ele && Number.isFinite(Number(ele)) ? Number(ele) : null)
    }
    const name = xml.getElementsByTagName('name')[0]?.textContent?.trim() || file.name.replace(/\.[^.]+$/, '')
    return { name, coordinates, elevations, source: 'gpx' }
  }
  if (root === 'trainingcenterdatabase') {
    const points = [...xml.getElementsByTagName('Trackpoint')]
    const coordinates: Position[] = []; const elevations: (number | null)[] = []
    for (const point of points) {
      const pos = point.getElementsByTagName('Position')[0]
      const lat = Number(pos?.getElementsByTagName('LatitudeDegrees')[0]?.textContent)
      const lon = Number(pos?.getElementsByTagName('LongitudeDegrees')[0]?.textContent)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
      coordinates.push([lon, lat]); const ele = point.getElementsByTagName('AltitudeMeters')[0]?.textContent
      elevations.push(ele && Number.isFinite(Number(ele)) ? Number(ele) : null)
    }
    const name = xml.getElementsByTagName('Name')[0]?.textContent?.trim() || file.name.replace(/\.[^.]+$/, '')
    return { name, coordinates, elevations, source: 'tcx' }
  }
  throw new Error('Unsupported file. Please select a GPX or TCX route.')
}

export function makeGpx(name: string, coordinates: Position[], elevations: (number | null)[]): string {
  const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!))
  const points = coordinates.map(([lon, lat], i) => `      <trkpt lat="${lat}" lon="${lon}">${elevations[i] == null ? '' : `<ele>${elevations[i]}</ele>`}</trkpt>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Endurance Route Planner" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${escape(name)}</name></metadata><trk><name>${escape(name)}</name><trkseg>\n${points}\n    </trkseg></trk></gpx>`
}
