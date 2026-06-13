import { useState, useEffect } from 'react'

const STORAGE_KEY = 'cpg-settings'

const defaults = {
  shake: true,
  sound: true,
  boardTheme: 'classic',
  ratingMin: 1000,
  ratingMax: 2000,
  themes: [], // empty = all themes
  showExplanations: false,
  adaptiveDifficulty: false,
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return defaults
  }
}

/** Persisted user settings (shake animation, sound, board theme, filters). */
export function useSettings() {
  const [settings, setSettings] = useState(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // ignore (e.g. private browsing storage errors)
    }
  }, [settings])

  const update = (patch) => setSettings(s => ({ ...s, ...patch }))

  return [settings, update]
}
