# NestJS API foundation

The API is a separate deployable service. It owns hosted authentication, account isolation, PostgreSQL/PostGIS persistence, and Ride with GPS OAuth token exchange. Provider secrets and user tokens must never be sent to the Vue client.

## Local backend development

The standalone Vue application does not require this backend. To develop the hosted backend locally:

1. Start PostgreSQL with PostGIS from the repository root:

   ```bash
   docker compose up -d postgres
   ```

2. Copy `server/.env.example` to `server/.env` and adjust values if needed.
3. Install and start the API:

   ```bash
   cd server
   npm install
   npm run start:dev
   ```

4. Check `http://localhost:3000/api/v1/health`.
5. Apply `database/migrations/001_initial_schema.sql` after the database is running. The PostGIS extension is enabled automatically on first database initialization.

## Initial API foundation

- NestJS 11 application with `/api/v1` prefix.
- Environment-based PostgreSQL connection; TypeORM schema synchronization is disabled.
- Health endpoint verifies the database and PostGIS extension.
- Initial SQL schema for users, sessions, per-user OAuth connections, routes, checkpoints, and route preferences.
- Route lines and checkpoint locations use PostGIS geometry with SRID 4326.

Authentication, account-owned route endpoints, encryption-key management, and Ride with GPS OAuth are intentionally subsequent implementation steps. Do not expose this API publicly until those controls are implemented.

## Security requirements for the next backend milestone

- Hash passwords with Argon2id.
- Use opaque, hashed server-side sessions with secure, HTTP-only, SameSite cookies.
- Enforce route ownership in every query and mutation.
- Encrypt provider access/refresh tokens with an application-managed key (not a key stored in the database).
- Validate OAuth `state`, use PKCE if supported by the provider, and keep the Ride with GPS client secret server-side.
- Keep database migrations explicit; never enable TypeORM `synchronize` in production.
