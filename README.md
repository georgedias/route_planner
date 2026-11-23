# Endurance Route Planner

Vue 3 + TypeScript route-planning application. Milestone 1 is a functional frontend prototype focused on preserving imported route geometry while adding distance-based checkpoints and validating ride time.

## Requirements
- Node.js 20.19+ (or 22.12+)
- npm

## Run locally
```bash
npm install
npm run dev
```
Open the local URL printed by Vite.

## Build and type-check
```bash
npm run typecheck
npm run build
```

## Milestone 1 features
- MapLibre GL JS with OpenStreetMap raster tiles
- Demo route to explore immediately
- GPX 1.1 track/route point import
- TCX Training Center Database trackpoint import
- Route distance calculation with Turf.js
- Add split/rest/control checkpoints by distance
- Click the map to place a split at the nearest point on the existing line
- Edit and remove checkpoints
- Segment-independent pace assumption, elapsed-time and rest-time estimates
- Time-limit validation and buffer display
- Elevation profile when elevation samples are available
- GPX track export

## Current limitations
- Ride with GPS is represented in the UI but not yet connected. OAuth, API credentials and provider-specific route retrieval belong in the backend integration milestone.
- OpenStreetMap map tiles are loaded directly from the public tile service for development. For production, use a suitable tile provider or self-hosted tiles and follow its usage policy.
- Convenience-store discovery is a UI placeholder. The next milestone should add a backend POI service using Overpass or another provider, route-corridor filtering, detour distance and opening-hours verification.
- Checkpoint drag handles are visual affordances only in this milestone; use Edit to change the checkpoint distance. Map click creates a checkpoint at the nearest point on the track.
- Rerouting is intentionally not implemented. Existing road geometry is preserved.
- Imported elevation samples are used for a simple profile and positive elevation-gain estimate. GPX files without elevation show an empty-state message.
- This is a frontend milestone; persistence, user accounts and the API are architectural targets, not implemented endpoints.

## Architecture

```text
Vue 3 + TypeScript + Vite
  ├─ MapLibre GL JS (map and GeoJSON layers)
  ├─ Pinia (route planning state)
  ├─ Turf.js (line length and distance-along-line)
  ├─ routeFiles service (GPX / TCX parse and GPX export)
  └─ RoutePlanner view
          │ REST / JSON (planned)
          ▼
NestJS API (planned)
  ├─ Route module: CRUD, import/export, validation
  ├─ RideWithGPS module: OAuth and provider API adapter
  ├─ POI module: Overpass/provider abstraction and corridor search
  └─ Routing module: optional GraphHopper / Valhalla / OSRM adapter
          │
          ▼
PostgreSQL + PostGIS (planned)
  ├─ routes and versioned geometries
  ├─ checkpoints and segment pacing
  └─ saved POIs / user preferences
```

## Domain model principles
- Keep route geometry and planning checkpoints separate.
- Store checkpoint position as distance from route start (linear reference) and derive coordinates from the current geometry.
- Preserve the imported route as the source geometry; rerouting should create a new route version rather than silently replacing the original.
- Keep moving time, rest time and elapsed time distinct. Later versions can support per-segment speed profiles, scheduled cutoffs and actual ride telemetry.

## Suggested next milestone
1. Add NestJS REST API and PostgreSQL/PostGIS persistence.
2. Add Overpass-backed POI search along a route corridor, including detour distance.
3. Add Ride with GPS OAuth and route retrieval after confirming API access/terms.
4. Add optional rerouting via a routing provider, storing the rerouted geometry as a new version.
