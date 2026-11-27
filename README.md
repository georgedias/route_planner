# Endurance Route Planner

A Vue 3 + TypeScript endurance route planner organized as an npm-workspaces monorepo. The local planner remains standalone; the hosted architecture adds a NestJS REST API and PostgreSQL/PostGIS without creating a second route-calculation implementation.

## Repository structure

```text
endurance-route-planner/
├── apps/
│   ├── web/                 # Vue 3 + Vite application
│   └── api/                 # NestJS REST API
├── packages/
│   └── shared/              # Shared route domain model and types
├── docker-compose.yml       # Optional local PostGIS database
├── package.json             # npm workspaces and root commands
└── README.md
```

## Requirements

- Node.js 20.19+ (or 22.12+)
- npm 10+
- Docker Desktop / Docker Engine only when running the optional API database

## Install workspaces

Run once from the repository root:

```bash
npm install
```

## Run the local planner

```bash
npm run dev
```

The default `VITE_APP_MODE=local` runs without accounts, a backend, or PostgreSQL. The active route is saved in this browser using IndexedDB (with localStorage as a compatibility fallback). GPX and TCX import are supported; GPX export includes checkpoint waypoints plus versioned planner metadata for round-trip restoration of the ride start date/time, target distance and units, time limit, overall/split speed mode, overall speed, clock format, and per-checkpoint speeds and stop durations. The local application does not require Docker. Local changes are automatically saved to the browser profile; reopening the app at the same origin restores the last active route, including checkpoints. Browser private sessions, cleared site data, or switching browser profiles/origins do not share that local database.

## Run the NestJS API foundation (optional)

In a second terminal, from the repository root:

```bash
cp apps/api/.env.example apps/api/.env
docker compose up -d postgres
npm run dev:api
```

The health endpoint is `http://localhost:3000/api/v1/health`. Apply the initial schema after the database starts:

```bash
docker compose exec -T postgres psql -U planner -d endurance_route_planner < apps/api/database/migrations/001_initial_schema.sql
```

The PostGIS extension is enabled automatically for a fresh Docker volume. The database is optional and is not used by local mode.

## Workspace commands (start, build, format)

| Command                                | Purpose                                 |
| -------------------------------------- | --------------------------------------- |
| `npm run dev`                          | Start Vue/Vite local planner            |
| `npm run dev:web`                      | Explicit start frontend (same as `dev`) |
| `npm run dev:api`                      | Start NestJS in watch mode (API server) |
| `npm run build:web`                    | Build Vue application (frontend)        |
| `npm run build:api`                    | Build NestJS API                        |
| `npm run build`                        | Build shared package, frontend and API  |
| `npm run preview --workspace=apps/web` | Preview the Production frontend         |
| `npm run typecheck`                    | Type-check frontend and API             |
| `npm run format`                       | Format all workspace source and docs    |
| `npm run format:check`                 | Check formatting                        |

## Workspace commands (run)

### Local Mode

| Command           | Purpose                                               |
| ----------------- | ----------------------------------------------------- |
| `npm run dev`     | Start Vue/Vite local planner                          |
| `npm run dev:web` | Same as `dev` (loads apps\web\.env.development.local) |

Runs on:

http://localhost:5173

### Hosted Mode

Hosted Mode requires the API server and frontend to run separately.

| Command              | Purpose                                           |
| -------------------- | ------------------------------------------------- |
| `npm run dev:hosted` | Start frontend (loads apps\web\.env.hosted.local) |
| `npm run dev:api`    | Start NestJS in watch mode (API server)           |
| `npm run build:web`  | Build Vue application                             |
| `npm run build:api`  | Build NestJS API                                  |
| `npm run build`      | Build shared package, frontend and API            |

**Important:**

`VITE_APP_MODE` and `VITE_API_BASE_URL` are Vite environment variables. They must be configured before building the frontend so their values are included in the production build.
These variables are configure in the `apps/web/.env.developement.local` and `apps/web/.env.hosted.local` files.

## Architecture and compatibility

- **Shared domain model:** `packages/shared/src/route.ts` defines route, checkpoint, speed and distance types. Frontend code imports it through `@endurance-route-planner/shared`.
- **Shared calculations:** the Vue/Pinia route store remains the single calculation engine. The API persists the same domain values; it must not introduce a second distance or schedule calculator.
- **Local mode:** browser IndexedDB persistence; no login, API or SQL database. GPX/TCX import and GPX export are available. GPX exports preserve checkpoint type, name, distance, stop duration and segment speed, plus planner settings (ride date/time, target distance, units, time limit, speed mode and overall speed) in versioned planner-specific extensions.
- **Hosted mode:** Vue frontend + NestJS REST API + PostgreSQL/PostGIS. Authentication, account-owned route endpoints and production security controls are not implemented yet; do not expose the scaffold publicly.
- **Ride with GPS:** not connected yet. The planned integration supports optional local companion authorization and per-user hosted OAuth.
- **Canonical units:** route distances are stored in kilometres and speeds in kilometres/hour. Unit conversion happens at the UI boundary.

## Existing planner functionality retained

- GPX 1.1 track and waypoint import, plus Garmin TCX course/trackpoint and CoursePoint import
- Original imported waypoint names and coordinates preserved
- Route geometry remains unchanged when target distance is edited
- Kilometre/mile display, overall or per-segment speed planning
- Checkpoint scheduling, weekday, arrival/departure, and stoppage-time estimates
- Local browser persistence, GPX checkpoint round-trip export/import, map and elevation profile

## Hosted deployment notes

The NestJS container must be built from the repository root using `docker build -f apps/api/Dockerfile .`. Set `DATABASE_URL`, `DATABASE_SSL`, `WEB_ORIGIN`, and `PORT` in the hosting environment. Do not deploy the API publicly until authentication, authorization, account isolation, secure session handling, migrations, and operational backups are implemented.
