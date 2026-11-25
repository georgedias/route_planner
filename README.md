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
- GPX 1.1 track and waypoint import, plus TCX trackpoint and CoursePoint import
- On import, replace existing checkpoints with the imported waypoints and a new Finish checkpoint; classify waypoint names/types containing aid, control, checkpoint, water, fuel, feed, supply, or hydration as Aid Stations, and other waypoints as Rest Stops
- Plot imported waypoints at their original coordinates and automatically fit the map to the imported route and waypoint extent
- Route distance calculation with Turf.js
- Kilometre/mile distance and speed display (canonical values remain stored in metric units)
- Per-leg miles-travelled column in the checkpoint table, always shown in miles regardless of the selected display unit
- Overall-speed planning or individual average speed for each checkpoint-to-checkpoint segment
- Calculated riding average and elapsed average, including checkpoint stop durations
- Checkpoint schedule with estimated arrival, stop duration, and estimated departure times
- Ride start date for weekday calculation, with selectable 12-hour (AM/PM) or 24-hour clock display
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

### Distance and unit architecture

- **Canonical storage unit: kilometres.** Route geometry length, target distance, checkpoint positions, and segment distances are stored and calculated internally in kilometres, regardless of the user's selected display unit.
- **Miles are a presentation/input unit.** When the user selects Miles, values entered in miles are converted to kilometres before being stored. When the user selects Kilometres, values are used directly.
- **Conversions happen at the UI boundary.** Convert stored kilometres to miles for display, and convert mile-based input back to kilometres before updating the route model. Do not store a second mile-based copy of a distance.
- **Conversion constant:** 1 mile = 1.609344 kilometres; 1 kilometre = 0.6213711922 miles.
- **Checkpoint leg mileage:** the “Miles Travelled” table column converts each leg's canonical kilometre distance to miles for display, even when the main distance unit is set to kilometres.
- **Speed follows the same principle.** Average speeds are stored in km/h and converted to mph only for display/input when Miles is selected.

## Domain model principles

- Keep route geometry and planning checkpoints separate.
- Store route, target, checkpoint, and segment distances as kilometres internally; convert only for display and input. The checkpoint table’s “Miles Travelled” column is an intentional miles-only presentation.
- In split-speed mode, each checkpoint's average speed applies to the segment from the previous checkpoint to that checkpoint.
- Stop duration is added after arrival; estimated departure equals arrival plus that checkpoint’s stop duration. Earlier stops are included in later arrival estimates.
- Weekday labels are calculated from the selected ride start date and each checkpoint’s estimated arrival; the displayed clock format can be switched between 12-hour and 24-hour.
- Preserve imported geometry; future rerouting should create a new route version.

## Next milestone

1. Add NestJS REST API and PostgreSQL/PostGIS persistence.
2. Add Overpass-backed POI search along a route corridor, including detour distance.
3. Add Ride with GPS OAuth and route retrieval after confirming API access and terms.
4. Add optional rerouting while retaining original route versions.

### Import planning defaults

A successful GPX/TCX import sets the target distance and Finish checkpoint to the imported track length, retains the selected distance unit for display, and initializes the overall speed and time estimate using the configurable 10 mph default. Change `estimatedTravelSpeedMph` and `defaultDistanceUnit` in `src/config/appConfig.ts` to adjust these defaults. Time is estimated as imported route distance divided by the configured speed; checkpoint/rest time is not added to this initial estimate.

## Code formatting

This project uses [Prettier](https://prettier.io/) for consistent formatting. After installing dependencies, run:

```bash
npm run format       # Format supported source, styles, and documentation files
npm run format:check # Check formatting without changing files
```

The repository includes a `.prettierrc.json` configuration. Code comments focus on
important domain rules and non-obvious calculations rather than narrating every line.
