# Backend implementation target

The backend is intentionally not wired into milestone 1. Recommended implementation: NestJS with modules for routes, Ride with GPS, POIs and routing; PostgreSQL/PostGIS for route geometry and spatial queries. Keep provider tokens and OAuth secrets server-side. Add versioned route geometry so optional rerouting never overwrites the imported source track.
