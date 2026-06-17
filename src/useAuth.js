/**
 * useAuth — anonymous Supabase authentication.
 *
 * On first load, if no session exists, signs in anonymously so every user
 * has a persistent `user.id` without requiring registration. The anonymous
 * identity can later be upgraded to a permanent Google account via
 * `linkGoogle()` without losing any stored data.
 */

import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

async function ensureProfile(userId) {
  if (!supabase || !userId) return
  await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id' }).then(() => {})
}

export function useAuth() {
  const [user,      setUser]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [authError, setAuthError] = useState(null)

  const signInAnonymously = useCallback(async () => {
    if (!supabase) {
      setAuthError('Supabase not configured')
      return null
    }

    setAuthError(null)
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) {
      console.error('[Auth] anonymous sign-in failed:', error.message, error)
      setAuthError(error.message)
      return null
    }

    if (data.user) {
      setUser(data.user)
      await ensureProfile(data.user.id)
    }
    return data.user
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function init() {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (cancelled) return

      if (sessionError) {
        console.error('[Auth] getSession failed:', sessionError.message)
        setAuthError(sessionError.message)
        setLoading(false)
        return
      }

      if (session?.user) {
        setUser(session.user)
        await ensureProfile(session.user.id)
        setLoading(false)
        return
      }

      // Retry a few times — free-tier projects can 500 while waking up
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (cancelled) return

        if (!error && data.user) {
          setUser(data.user)
          setAuthError(null)
          await ensureProfile(data.user.id)
          setLoading(false)
          return
        }

        console.error(`[Auth] anonymous sign-in attempt ${attempt + 1} failed:`, error?.message)
        setAuthError(error?.message ?? 'Sign-in failed')
        if (attempt < 2) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
      }

      setLoading(false)
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        setUser(session?.user ?? null)
        if (session?.user) setAuthError(null)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const linkGoogle = useCallback(async () => {
    if (!supabase) return { error: { message: 'Supabase not configured' } }
    if (!user) {
      const signedIn = await signInAnonymously()
      if (!signedIn) return { error: { message: authError ?? 'Could not sign in' } }
    }
    const { data, error } = await supabase.auth.linkIdentity({ provider: 'google' })
    if (error) console.error('[Auth] linkGoogle failed:', error.message)
    return { data, error }
  }, [user, authError, signInAnonymously])

  const isAnonymous = user
    ? (user.is_anonymous === true ||
       (user.identities ?? []).every(id => id.provider === 'anonymous'))
    : false

  return { user, loading, authError, isAnonymous, signInAnonymously, linkGoogle }
}
