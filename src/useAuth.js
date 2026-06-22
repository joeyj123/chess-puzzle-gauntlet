/**
 * useAuth — Supabase authentication (anonymous + Google OAuth).
 *
 * Architecture:
 *  • onAuthStateChange is the single source of truth for all auth state.
 *  • Bootstrap (mount) calls getSession() once — uses the existing session
 *    if present, otherwise creates an anonymous guest session.
 *  • visibilitychange handler re-verifies on PWA wake WITHOUT clearing the
 *    user on transient failures (prevents "phone lock = sign out" bug).
 *  • No custom OAuth detection loop. Supabase's detectSessionInUrl:true
 *    (set in supabaseClient.js) handles the PKCE exchange automatically;
 *    the resulting SIGNED_IN event updates state via the listener.
 */

import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

async function ensureProfile(userId) {
  if (!supabase || !userId) return
  await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id' }).then(() => {})
}

function userHasGoogle(user) {
  if (!user) return false
  return (user.identities ?? []).some(id => id.provider === 'google')
}

function userIsAnonymous(user) {
  if (!user) return false
  if (userHasGoogle(user)) return false
  return user.is_anonymous === true ||
    (user.identities ?? []).every(id => id.provider === 'anonymous')
}

/** Consume and clean Supabase OAuth error params from the current URL. */
function consumeOAuthError() {
  const search = new URLSearchParams(window.location.search)
  const hash   = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const code   = search.get('error_code') || hash.get('error_code')
  const desc   = (search.get('error_description') || hash.get('error_description') || '')
    .replace(/\+/g, ' ')

  if (!search.get('error') && !hash.get('error') && !code) return null

  window.history.replaceState(null, '', window.location.pathname)
  return { code, description: desc }
}

export function useAuth() {
  const [user,               setUser]               = useState(null)
  const [loading,            setLoading]            = useState(true)
  const [authError,          setAuthError]          = useState(null)
  const [googleAlreadyLinked, setGoogleAlreadyLinked] = useState(false)

  const REDIRECT_URL = 'https://chess-puzzle-gauntlet.vercel.app'

  const markOAuthPending = () => {
    try { sessionStorage.setItem('cpg-oauth-pending', '1') } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    // ── Auth state listener ───────────────────────────────────────────────────
    // Registered first so no events are missed during the async bootstrap.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user)
        setAuthError(null)
        if (userHasGoogle(session.user)) setGoogleAlreadyLinked(false)
        setLoading(false)
      } else if (event === 'SIGNED_OUT') {
        // Only wipe user on an intentional sign-out that happens while the
        // app is visible.  If the phone is locked / backgrounded, a transient
        // token-refresh failure can fire SIGNED_OUT even though the session is
        // still valid — we re-verify on visibilitychange instead.
        if (document.visibilityState === 'visible') {
          setUser(null)
          setLoading(false)
        }
      }
    })

    // ── Bootstrap ─────────────────────────────────────────────────────────────
    ;(async () => {
      // Handle OAuth error params (identity_already_exists, denied, etc.).
      const oauthErr = consumeOAuthError()
      if (oauthErr) {
        if (oauthErr.code === 'identity_already_exists') {
          setGoogleAlreadyLinked(true)
          setAuthError('This Google account is already linked. Use "Sign in with Google" below.')
        } else {
          setAuthError(oauthErr.description || oauthErr.code || 'Sign-in failed')
        }
      }

      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        // Valid session already exists — keep it. onAuthStateChange
        // INITIAL_SESSION will also fire, but setUser is idempotent.
        setUser(session.user)
        setLoading(false)
        return
      }

      // If a PKCE code is in the URL, detectSessionInUrl:true is exchanging
      // it asynchronously. onAuthStateChange will fire SIGNED_IN when done.
      // Clean the URL and stand by — do not create a conflicting guest session.
      const searchParams = new URLSearchParams(window.location.search)
      if (searchParams.get('code')) {
        window.history.replaceState(null, '', window.location.pathname)
        setLoading(false)
        return
      }

      // Fresh visitor (no session, no OAuth in progress): create guest session.
      if (!oauthErr) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (error) {
          console.error('[Auth] anonymous sign-in failed:', error.message)
          // Don't set authError — just leave user null; they can still use
          // the app and the button will remain clickable.
        } else if (data.user) {
          setUser(data.user)
          await ensureProfile(data.user.id)
        }
      }

      setLoading(false)
    })()

    // ── PWA wake / visibilitychange ───────────────────────────────────────────
    // When the phone is unlocked or the PWA comes to foreground, re-verify the
    // session.  Only SET user on success — never CLEAR it here, because a
    // brief network outage on wake can return null even for a valid session.
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible' || !supabase) return
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) setUser(session.user)
      })
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // ── Auth actions ─────────────────────────────────────────────────────────────

  const signInAnonymously = useCallback(async () => {
    if (!supabase) { setAuthError('Supabase not configured'); return null }
    setAuthError(null)
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) {
      console.error('[Auth] anonymous sign-in failed:', error.message)
      setAuthError(error.message)
      return null
    }
    if (data.user) {
      setUser(data.user)
      await ensureProfile(data.user.id)
    }
    return data.user
  }, [])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return { error: { message: 'Supabase not configured' } }
    setAuthError(null)
    // Sign out any existing guest so Supabase doesn't try to link to it,
    // which fails if the Google account is already on a separate user row.
    await supabase.auth.signOut()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo:     REDIRECT_URL,
        scopes:         'email profile',
        skipNonceCheck: true,
      },
    })
    if (error) {
      console.error('[Auth] signInWithGoogle failed:', error.message)
      return { data, error }
    }
    if (data?.url) {
      markOAuthPending()
      window.location.href = data.url
      return { data, error: null }
    }
    return { data, error: { message: 'No OAuth URL returned from Supabase' } }
  }, [])

  const linkGoogle = useCallback(async () => {
    if (!supabase) return { error: { message: 'Supabase not configured' } }
    const { data, error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: {
        redirectTo:     REDIRECT_URL,
        scopes:         'email profile',
        skipNonceCheck: true,
      },
    })
    if (error) {
      console.error('[Auth] linkGoogle failed:', error.message)
      return { data, error }
    }
    if (data?.url) {
      markOAuthPending()
      window.location.href = data.url
      return { data, error: null }
    }
    return { data, error: { message: 'No OAuth URL returned from Supabase' } }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return { error: { message: 'Supabase not configured' } }
    setAuthError(null)
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('[Auth] signOut failed:', error.message)
      return { error }
    }
    setUser(null)
    setGoogleAlreadyLinked(false)
    await signInAnonymously()
    return { error: null }
  }, [signInAnonymously])

  return {
    user,
    loading,
    authError,
    googleAlreadyLinked,
    isAnonymous: userIsAnonymous(user),
    signInAnonymously,
    signInWithGoogle,
    linkGoogle,
    signOut,
  }
}
