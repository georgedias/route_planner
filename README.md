# Endurance Route Planner

Vue 3 + TypeScript route-planning application. Milestone 1 is a frontend prototype for importing GPX/TCX tracks, preserving route geometry, planning checkpoints and segment speeds, estimating elapsed ride time, and exporting GPX.

## Requirements
- Node.js 20.19+ (or 22.12+)
- npm

## Run locally
```bash
npm install
npm run dev
```

## Build and type-check
```bash
npm run typecheck
npm run build
```

## Milestone 1 features
- MapLibre GL JS with OpenStreetMap raster tiles and a demo route
- GPX 1.1 and TCX trackpoint import
- Route distance calculation with Turf.js
- Kilometre/mile distance and speed display (canonical values remain stored in metric units)
- Overall-speed planning or individual average speed for each checkpoint-to-checkpoint segment
- Calculated riding average and elapsed average, including checkpoint stop durations
- Add, edit, and remove split, rest, and Aid Station (A) checkpoints
- Full checkpoint editor modal with type, name, route distance, segment speed, and stop duration
- Place checkpoints by clicking the nearest point on the existing route
- Moving-time, rest-time, elapsed-time, and time-limit estimates
- Elevation profile when imported elevation samples are available
- GPX track export

## Current limitations
- Ride with GPS is represented in the UI but not connected; OAuth and provider API integration remain future work.
- Convenience-store discovery is a UI placeholder; a future backend can use Overpass or another POI provider.
- Checkpoint drag handles are visual only; use Edit to change checkpoint distance.
- Rerouting is not implemented. Imported road geometry is preserved.
- Persistence, accounts, and API endpoints are planned, not implemented.

## Architecture target
The frontend uses Vue 3, Vite, TypeScript, Pinia, MapLibre GL JS, and Turf.js. The planned backend is NestJS with PostgreSQL/PostGIS, plus integrations for Ride with GPS, OpenStreetMap POIs, and optional GraphHopper/Valhalla/OSRM routing.

## Domain model principles
- Keep route geometry and planning checkpoints separate.
- Store checkpoint positions and target distances as kilometres internally; convert only for display and input.
- In split-speed mode, each checkpoint's average speed applies to the segment from the previous checkpoint to that checkpoint.
- Stop duration is added after arrival; elapsed average includes stop time while riding average excludes it.
- Preserve imported geometry; future rerouting should create a new route version.

## Next milestone
1. Add NestJS REST API and PostgreSQL/PostGIS persistence.
2. Add Overpass-backed POI search along a route corridor, including detour distance.
3. Add Ride with GPS OAuth and route retrieval after confirming API access and terms.
4. Add optional rerouting while retaining original route versions.
