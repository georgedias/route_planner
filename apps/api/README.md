# NestJS API workspace

This is the backend workspace in the Endurance Route Planner monorepo. Run commands from the repository root:

```bash
cp apps/api/.env.example apps/api/.env
docker compose up -d postgres
npm run dev:api
```

Build and type-check with `npm run build:api` and `npm run typecheck --workspace @endurance-route-planner/api`.

The API currently provides the `/api/v1/health` database/PostGIS health check and an initial PostgreSQL schema. Authentication, account-owned route endpoints, authorization guards, and production security are not implemented. Do not expose this API publicly yet.
