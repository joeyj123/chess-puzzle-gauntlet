/**
 * useAuth — anonymous Supabase authentication.
 *
 * On first load, if no session exists, signs in anonymously so every user
 * has a persistent `user.id` without requiring registration. The anonymous
 * identity can later be upgraded to a permanent Google account via
 * `linkGoogle()` without losing any stored data.
 *
 * If Google was already linked on a prior attempt (identity_already_exists),
 * use `signInWithGoogle()` to sign into that existing account instead.
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

/** Read OAuth error params Supabase appends after a failed redirect. */
function consumeOAuthError() {
  const search = new URLSearchParams(window.location.search)
  const hashRaw = window.location.hash.replace(/^#/, '')
  const hash = new URLSearchParams(hashRaw)

  const code = search.get('error_code') || hash.get('error_code')
  const desc = (search.get('error_description') || hash.get('error_description') || '')
    .replace(/\+/g, ' ')

  if (!search.get('error') && !hash.get('error') && !code) return null

  window.history.replaceState(null, '', window.location.pathname)
  return { code, description: desc }
}

/** True when the current URL contains an OAuth callback payload. */
function detectOAuthCallback() {
  const search = new URLSearchParams(window.location.search)
  return !!search.get('code') || window.location.hash.includes('access_token')
}

/** True when running as an installed PWA (standalone display mode). */
function isStandalonePWA() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

async function refreshUser() {
  if (!supabase) return null
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) {
    console.error('[Auth] getUser failed:', error.message)
    return null
  }
  return user
}

export function useAuth() {
  const [user,      setUser]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [authError, setAuthError] = useState(null)
  const [googleAlreadyLinked, setGoogleAlreadyLinked] = useState(false)

  // Always redirect back to the canonical production URL so mobile PWA
  // standalone mode (which opens OAuth in the system browser) routes the
  // token back into the correct origin rather than a localhost or preview URL.
  const REDIRECT_URL = 'https://chess-puzzle-gauntlet.vercel.app'

  // OAuth (Google sign-in/link) leaves the SPA entirely and comes back via a
  // full page reload — React state is gone. Setting this flag right before
  // leaving lets App.jsx detect "we're coming back from OAuth" on the next
  // load and reopen Settings instead of the old bot-game screen.
  const markOAuthPending = () => {
    try { sessionStorage.setItem('cpg-oauth-pending', '1') } catch { /* ignore */ }
  }

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

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return { error: { message: 'Supabase not configured' } }
    setAuthError(null)
    // Sign out the current guest session first — otherwise Supabase tries to
    // link Google to this guest, which fails if Google is already on another account.
    await supabase.auth.signOut()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: REDIRECT_URL,
        scopes: 'email profile',
        skipNonceCheck: true,
      },
    })
    if (error) {
      console.error('[Auth] signInWithGoogle failed:', error.message)
      // Clear error so the button stays clickable
      setAuthError(null)
      return { data, error }
    }
    if (data?.url) {
      markOAuthPending()
      window.location.href = data.url
      return { data, error: null }
    }
    return { data, error: { message: 'No OAuth URL returned from Supabase' } }
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let cancelled = false

    // Register the listener FIRST, before init() runs, so we never miss a
    // SIGNED_IN event that fires during the async init flow.
    //
    // We only null the user on an explicit SIGNED_OUT — not on INITIAL_SESSION
    // with a null session (which fires before the OAuth code exchange completes
    // and would race against our init() logic and blank the user).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return
      if (session?.user) {
        const fresh = await refreshUser()
        if (!cancelled) {
          setUser(fresh ?? session.user)
          if (userHasGoogle(fresh ?? session.user)) {
            setGoogleAlreadyLinked(false)
            setAuthError(null)
          }
          setLoading(false)
        }
      } else if (event === 'SIGNED_OUT') {
        // Only clear the user on an intentional sign-out, not on intermediate
        // null sessions that appear during the PKCE code exchange.
        if (!cancelled) setUser(null)
      }
    })

    async function init() {
      const oauthErr = consumeOAuthError()
      if (oauthErr) {
        if (oauthErr.code === 'identity_already_exists') {
          setGoogleAlreadyLinked(true)
          setAuthError('This Google account is already linked. Use "Sign in with Google" below.')
        } else {
          setAuthError(oauthErr.description || oauthErr.code || 'Sign-in failed')
        }
      }

      // Detect whether we're landing from an OAuth redirect.
      // supabaseClient.js sets detectSessionInUrl:true + flowType:'pkce', so
      // Supabase automatically exchanges the ?code= during createClient() and
      // fires SIGNED_IN via onAuthStateChange above.  Do NOT call
      // exchangeCodeForSession manually — double-exchanging the code causes the
      // server to reject the second attempt, which can fire SIGNED_OUT and
      // blank the UI (the "flash then reset" bug).
      const isOAuthReturn = detectOAuthCallback()

      if (isOAuthReturn) {
        // In standalone PWA mode the JS runtime sometimes needs a tick to
        // finish the async PKCE exchange before getSession() reflects it.
        if (isStandalonePWA()) {
          await new Promise(r => setTimeout(r, 150))
        }
        // Clean the callback params from the URL regardless of outcome.
        window.history.replaceState(null, '', window.location.pathname)
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (cancelled) return

      if (sessionError) {
        console.error('[Auth] getSession failed:', sessionError.message)
        // Don't set authError here — a session fetch failure shouldn't lock
        // the sign-in button.  Just fall through to anonymous sign-in.
      }

      if (session?.user) {
        const fresh = await refreshUser()
        if (!cancelled) {
          setUser(fresh ?? session.user)
          if (fresh) await ensureProfile(fresh.id)
          if (userHasGoogle(fresh ?? session.user)) {
            setGoogleAlreadyLinked(false)
            setAuthError(null)
          }
        }
        setLoading(false)
        return
      }

      // If we're on an OAuth return URL but getSession() returned null, the
      // PKCE exchange is still in flight and onAuthStateChange will deliver
      // the session shortly.  Don't race it with an anonymous sign-in.
      if (isOAuthReturn) {
        setLoading(false)
        return
      }

      // Fresh visitor — create an anonymous session.
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (cancelled) return

        if (!error && data.user) {
          setUser(data.user)
          if (!oauthErr) setAuthError(null)
          await ensureProfile(data.user.id)
          setLoading(false)
          return
        }

        console.error(`[Auth] anonymous sign-in attempt ${attempt + 1} failed:`, error?.message)
        // Only surface the error after all retries — and never when returning
        // from OAuth (the button should always stay clickable).
        if (attempt === 2 && !oauthErr) {
          setAuthError(error?.message ?? 'Sign-in failed')
        }
        if (attempt < 2) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
      }

      setLoading(false)
    }

    init()

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
    const { data, error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: {
        redirectTo: REDIRECT_URL,
        scopes: 'email profile',
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
  }, [user, authError, signInAnonymously])

  // Sign out of whatever account is active on THIS device and drop back to a
  // fresh guest session.
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
    // Immediately re-establish a guest session so the app isn't left signed out.
    await signInAnonymously()
    return { error: null }
  }, [signInAnonymously])

  const isAnonymous = userIsAnonymous(user)

  return {
    user,
    loading,
    authError,
    googleAlreadyLinked,
    isAnonymous,
    signInAnonymously,
    signInWithGoogle,
    linkGoogle,
    signOut,
  }
}
