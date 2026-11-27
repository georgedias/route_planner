import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { ClockFormat, DistanceUnit, SpeedMode } from '../types/route'

const STORAGE_KEY = 'endurance-route-planner:app-settings:v1'

const DEFAULTS = {
  defaultDistanceUnit: 'mi' as DistanceUnit,
  defaultSpeedMode: 'overall' as SpeedMode,
  defaultSpeedKmh: 20,
  defaultClockFormat: '12h' as ClockFormat,
}

interface StoredSettings {
  defaultDistanceUnit: DistanceUnit
  defaultSpeedMode: SpeedMode
  defaultSpeedKmh: number
  defaultClockFormat: ClockFormat
}

function loadSettings(): StoredSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS }

  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!saved || typeof saved !== 'object') return { ...DEFAULTS }

    const value = saved as Record<string, unknown>
    return {
      defaultDistanceUnit:
        value.defaultDistanceUnit === 'km' || value.defaultDistanceUnit === 'mi'
          ? value.defaultDistanceUnit
          : DEFAULTS.defaultDistanceUnit,
      defaultSpeedMode:
        value.defaultSpeedMode === 'overall' || value.defaultSpeedMode === 'split'
          ? value.defaultSpeedMode
          : DEFAULTS.defaultSpeedMode,
      defaultSpeedKmh:
        typeof value.defaultSpeedKmh === 'number' &&
        Number.isFinite(value.defaultSpeedKmh) &&
        value.defaultSpeedKmh > 0
          ? value.defaultSpeedKmh
          : DEFAULTS.defaultSpeedKmh,
      defaultClockFormat:
        value.defaultClockFormat === '12h' || value.defaultClockFormat === '24h'
          ? value.defaultClockFormat
          : DEFAULTS.defaultClockFormat,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export const useAppSettingsStore = defineStore('appSettings', () => {
  const initial = loadSettings()

  const defaultDistanceUnit = ref<DistanceUnit>(initial.defaultDistanceUnit)
  const defaultSpeedMode = ref<SpeedMode>(initial.defaultSpeedMode)
  const defaultSpeedKmh = ref(initial.defaultSpeedKmh)
  const defaultClockFormat = ref<ClockFormat>(initial.defaultClockFormat)

  function saveSettings() {
    if (typeof localStorage === 'undefined') return

    try {
      const settings: StoredSettings = {
        defaultDistanceUnit: defaultDistanceUnit.value,
        defaultSpeedMode: defaultSpeedMode.value,
        defaultSpeedKmh: defaultSpeedKmh.value,
        defaultClockFormat: defaultClockFormat.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // Keep the application usable if browser storage is unavailable or full.
    }
  }

  watch(
    [defaultDistanceUnit, defaultSpeedMode, defaultSpeedKmh, defaultClockFormat],
    saveSettings,
    { flush: 'sync' },
  )

  function resetSettings() {
    defaultDistanceUnit.value = DEFAULTS.defaultDistanceUnit
    defaultSpeedMode.value = DEFAULTS.defaultSpeedMode
    defaultSpeedKmh.value = DEFAULTS.defaultSpeedKmh
    defaultClockFormat.value = DEFAULTS.defaultClockFormat
  }

  return {
    defaultDistanceUnit,
    defaultSpeedMode,
    defaultSpeedKmh,
    defaultClockFormat,
    resetSettings,
  }
})
