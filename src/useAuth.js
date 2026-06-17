/**
 * useAuth — anonymous Supabase authentication.
 *
 * On first load, if no session exists, signs in anonymously so every user
 * has a persistent `user.id` without requiring registration. The anonymous
 * identity can later be upgraded to a permanent Google account via
 * `linkGoogle()` without losing any stored data.
 *
 * Returns { user, loading, isAnonymous, linkGoogle }
 *   user        - Supabase User object, or null while loading / supabase unconfigured
 *   loading     - true until the initial session check + sign-in completes
 *   isAnonymous - true if the user has not yet linked a provider
 *   linkGoogle  - async fn; upgrades the anonymous session to Google OAuth
 */

import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

export function useAuth() {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      // Supabase not configured — silently skip auth
      setLoading(false)
      return
    }

    let cancelled = false

    async function init() {
      // Check for an existing session first
      const { data: { session } } = await supabase.auth.getSession()

      if (cancelled) return

      if (session?.user) {
        setUser(session.user)
        setLoading(false)
      } else {
        // No session — sign in anonymously so we always have a user.id
        const { data, error } = await supabase.auth.signInAnonymously()
        if (!cancelled) {
          if (error) {
            console.error('[Auth] anonymous sign-in failed:', error.message)
          } else {
            setUser(data.user)
          }
          setLoading(false)
        }
      }
    }

    init()

    // Keep local state in sync if the session changes elsewhere (tab focus,
    // OAuth redirect, token refresh, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setUser(session?.user ?? null)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  /**
   * Upgrade the current anonymous session to a permanent Google account.
   * Supabase merges the anonymous profile into the Google identity, so
   * all previously saved data (game history, stats) is preserved.
   */
  const linkGoogle = useCallback(async () => {
    if (!supabase) return { error: 'Supabase not configured' }
    const { data, error } = await supabase.auth.linkIdentity({ provider: 'google' })
    if (error) console.error('[Auth] linkGoogle failed:', error.message)
    return { data, error }
  }, [])

  const isAnonymous = user
    ? !(user.identities ?? []).some(id => id.provider !== 'anonymous')
    : false

  return { user, loading, isAnonymous, linkGoogle }
}
