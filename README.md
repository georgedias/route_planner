# Endurance Route Planner

Vue 3 + TypeScript route-planning application. Milestone 1 is a frontend prototype for importing GPX/TCX tracks, preserving route geometry, planning checkpoints and segment speeds, estimating elapsed ride time, and exporting GPX.

## Requirements
- Node.js 20.19+ (or 22.12+)
- npm

## Run locally (standalone mode)
```bash
npm install
npm run dev
```

The default `VITE_APP_MODE=local` runs without accounts, a server, or PostgreSQL. The active route is saved in this browser using IndexedDB (with localStorage as a compatibility fallback), including imported route geometry and checkpoints. GPX and TCX import/export remain available. Browser storage is local to the browser profile; use GPX export to make a portable route backup.

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
- Per-leg distance column in the checkpoint table, displayed in the selected Miles/Kilometres unit
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
- Ride with GPS is represented in the UI but not connected. The planned integration supports both an optional local companion service and each hosted user's own OAuth connection; OAuth callback registration and provider credentials must be verified before enabling it.
- Convenience-store discovery is a UI placeholder; a future backend can use Overpass or another POI provider.
- Checkpoint drag handles are visual only; use Edit to change checkpoint distance.
- Rerouting is not implemented. Imported road geometry is preserved.
- Hosted authentication and account-owned route API endpoints are not implemented yet. The NestJS/PostGIS foundation and initial database schema are scaffolded; do not expose the API publicly until authentication and ownership enforcement are complete.

## Architecture

The local and hosted applications share one route domain model (`packages/shared/src/route.ts`) and the same Vue/Pinia route calculations. Storage and authentication are mode-specific; imported geometry and canonical kilometre/km/h calculations do not change between modes.

- **Local mode (default):** Vue 3 + browser IndexedDB persistence. No login, NestJS service, or SQL database is required. GPX/TCX import and export remain available. Ride with GPS is planned as an optional connection through a local OAuth companion service so the client secret is not exposed in browser code.
- **Hosted mode:** Vue frontend + NestJS REST API + PostgreSQL/PostGIS. Each account owns its routes, checkpoints, preferences, and Ride with GPS OAuth connection. The provider secret and encrypted user tokens stay server-side.
- **API foundation:** `server/` contains the NestJS 11 service, `/api/v1/health` PostGIS health check, and initial schema migration. `docker-compose.yml` starts a local PostGIS database for backend development. Authentication and account-owned route endpoints are the next backend work; the scaffold is not production-ready until those controls are implemented.
- **Shared calculations:** the current route store remains the single calculation engine used by both modes. The API persists the same domain values rather than introducing a second, divergent distance/schedule calculator.

### Start the backend foundation (optional)

The local planner does not need this. For backend development, start PostGIS and then the API:

```bash
docker compose up -d postgres
cd server
cp .env.example .env
npm install
npm run start:dev
```

The health endpoint is `http://localhost:3000/api/v1/health`. Apply the initial schema after the database starts with `docker compose exec -T postgres psql -U planner -d endurance_route_planner < server/database/migrations/001_initial_schema.sql`. The PostGIS extension is enabled automatically for a fresh Docker volume.

### Hosted deployment notes

Render's current free Postgres documentation lists 1 GB storage, but also says free databases expire after 30 days and are not backed up. Free web services can sleep/restart. Treat this as a development/demo tier, not durable multi-user production storage. Confirm current provider terms and retention guarantees before selecting a production plan.

### Distance and unit architecture

- **Canonical storage unit: kilometres.** Route geometry length, target distance, checkpoint positions, and segment distances are stored and calculated internally in kilometres, regardless of the user's selected display unit.
- **Miles are a presentation/input unit.** When the user selects Miles, values entered in miles are converted to kilometres before being stored. When the user selects Kilometres, values are used directly.
- **Conversions happen at the UI boundary.** Convert stored kilometres to miles for display, and convert mile-based input back to kilometres before updating the route model. Do not store a second mile-based copy of a distance.
- **Conversion constant:** 1 mile = 1.609344 kilometres; 1 kilometre = 0.6213711922 miles.
- **Checkpoint leg distance:** the travelled-distance table column converts each leg from canonical kilometres into the currently selected display unit.
- **Speed follows the same principle.** Average speeds are stored in km/h and converted to mph only for display/input when Miles is selected.

## Domain model principles
- Keep route geometry and planning checkpoints separate.
- Store route, target, checkpoint, and segment distances as kilometres internally; convert only for display and input. The checkpoint table’s “Miles Travelled” column is an intentional miles-only presentation.
- In split-speed mode, each checkpoint's average speed applies to the segment from the previous checkpoint to that checkpoint.
- Stop duration is added after arrival; estimated departure equals arrival plus that checkpoint’s stop duration. Earlier stops are included in later arrival estimates.
- Weekday labels are calculated from the selected ride start date and each checkpoint’s estimated arrival; the displayed clock format can be switched between 12-hour and 24-hour.
- Preserve imported geometry; future rerouting should create a new route version.

## Next milestones
1. Complete hosted authentication (registration, verification, secure sessions, password reset) and account-owned route/checkpoint REST endpoints.
2. Add an optional local Ride with GPS companion OAuth flow and the hosted per-account OAuth flow; verify local redirect URI support with Ride with GPS before enabling local connection.
3. Add Ride with GPS route listing/retrieval while preserving original route geometry and waypoint names; keep GPX/TCX available in both modes.
4. Add Overpass-backed POI search along a route corridor, including detour distance.
5. Add optional rerouting while retaining original route versions.


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

