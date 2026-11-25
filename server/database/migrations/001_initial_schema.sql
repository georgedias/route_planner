-- Initial multi-user persistence schema. Run after the PostGIS extension exists.
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS user_sessions_expires_at_idx ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS oauth_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  access_token_ciphertext BYTEA NOT NULL,
  refresh_token_ciphertext BYTEA,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider),
  UNIQUE (provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('demo', 'gpx', 'tcx', 'ridewithgps')),
  source_provider_id TEXT,
  geometry geometry(LineString, 4326) NOT NULL,
  elevations JSONB NOT NULL DEFAULT '[]'::jsonb,
  distance_km DOUBLE PRECISION NOT NULL CHECK (distance_km >= 0),
  target_distance_km DOUBLE PRECISION NOT NULL CHECK (target_distance_km >= 0),
  time_limit_minutes DOUBLE PRECISION NOT NULL DEFAULT 0,
  average_speed_kmh DOUBLE PRECISION NOT NULL DEFAULT 0,
  speed_mode TEXT NOT NULL DEFAULT 'overall' CHECK (speed_mode IN ('overall', 'split')),
  distance_unit TEXT NOT NULL DEFAULT 'mi' CHECK (distance_unit IN ('mi', 'km')),
  start_date DATE,
  start_time TIME,
  clock_format TEXT NOT NULL DEFAULT '12h' CHECK (clock_format IN ('12h', '24h')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS routes_user_id_idx ON routes(user_id);
CREATE INDEX IF NOT EXISTS routes_geometry_gix ON routes USING GIST(geometry);

CREATE TABLE IF NOT EXISTS checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('split', 'rest', 'aid_station', 'finish')),
  name TEXT NOT NULL,
  distance_km DOUBLE PRECISION NOT NULL CHECK (distance_km >= 0),
  rest_duration_minutes DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (rest_duration_minutes >= 0),
  average_speed_kmh DOUBLE PRECISION,
  location geometry(Point, 4326),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS checkpoints_route_id_idx ON checkpoints(route_id);
CREATE INDEX IF NOT EXISTS checkpoints_location_gix ON checkpoints USING GIST(location);

CREATE TABLE IF NOT EXISTS route_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
