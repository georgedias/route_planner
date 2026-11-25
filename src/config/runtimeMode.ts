export type ApplicationMode = 'local' | 'hosted'

/** Local mode is the safe default so existing standalone deployments keep working. */
export const APPLICATION_MODE: ApplicationMode =
  import.meta.env.VITE_APP_MODE === 'hosted' ? 'hosted' : 'local'

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')
