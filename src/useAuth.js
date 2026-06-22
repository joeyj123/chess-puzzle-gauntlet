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

/**
 * True ONLY when the URL contains a genuine Supabase OAuth callback payload.
 * Deliberately strict to prevent false positives from app-internal query params
 * (e.g. ?room=, ?chess=, or any ?code= / ?error= that isn't from Supabase).
 *
 * Rules:
 *  • PKCE success : ?code= MUST be paired with ?state= (Supabase always sends both)
 *  • Implicit     : #access_token= in hash (very Supabase-specific)
 *  • OAuth error  : ?error= or #error= MUST be paired with error_code or
 *                   error_description (Supabase always includes at least one)
 */
function detectOAuthCallback() {
  const search = new URLSearchParams(window.location.search)
  const hash   = new URLSearchParams(window.location.hash.replace(/^#/, ''))

  const hasPkce = !!search.get('code') && !!search.get('state')

  const hasImplicitToken = !!hash.get('access_token')

  const hasOAuthError =
    (!!search.get('error') || !!hash.get('error')) &&
    (!!search.get('error_code')        || !!hash.get('error_code') ||
     !!search.get('error_description') || !!hash.get('error_description'))

  return hasPkce || hasImplicitToken || hasOAuthError
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

  // Synchronously captured at mount, before any effect or history.replaceState
  // runs.  True means we are on an OAuth return URL and must not run the
  // anonymous guest sign-in fallback — the Google session is on its way.
  const [oauthProcessing, setOauthProcessing] = useState(() => detectOAuthCallback())

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
    // Show "Completing sign-in…" immediately on button click, before any async
    // work — this is the only legitimate way oauthProcessing becomes true on a
    // normal load (without an OAuth callback URL).
    setOauthProcessing(true)
    // Safety: if navigation doesn't happen within 3 s (e.g. Supabase call
    // fails or popup is blocked), reset the loading state so the button is
    // clickable again.
    const safetyTimer = setTimeout(() => setOauthProcessing(false), 3000)

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
      clearTimeout(safetyTimer)
      console.error('[Auth] signInWithGoogle failed:', error.message)
      setOauthProcessing(false)
      return { data, error }
    }
    if (data?.url) {
      markOAuthPending()
      window.location.href = data.url
      // safetyTimer will fire if the page somehow doesn't navigate; fine.
      return { data, error: null }
    }
    clearTimeout(safetyTimer)
    setOauthProcessing(false)
    return { data, error: { message: 'No OAuth URL returned from Supabase' } }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let cancelled = false

    // ── onAuthStateChange — registered BEFORE init() so no SIGNED_IN is missed.
    //
    // Rules:
    // • SIGNED_IN  → accept the session, clear any stale error, stop processing.
    // • SIGNED_OUT → only clear user on intentional sign-out (not on intermediate
    //                null sessions during PKCE exchange).
    // • Anything else with a session → update the user.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return

      if (session?.user) {
        const fresh = await refreshUser()
        if (!cancelled) {
          setUser(fresh ?? session.user)
          // Always clear errors and processing flag when a real session lands.
          setAuthError(null)
          setOauthProcessing(false)
          if (userHasGoogle(fresh ?? session.user)) {
            setGoogleAlreadyLinked(false)
          }
          setLoading(false)
        }
      } else if (event === 'SIGNED_OUT') {
        // Only wipe the user on an intentional sign-out — intermediate null
        // sessions during PKCE exchange must not clear state.
        if (!cancelled) {
          setUser(null)
          setOauthProcessing(false)
        }
      }
    })

    async function init() {
      // ── Ironclad OAuth guard ─────────────────────────────────────────────────
      // Check the URL RIGHT NOW (synchronous, before any awaits or URL cleanup).
      // supabaseClient.js uses detectSessionInUrl:true + flowType:'pkce', so
      // Supabase exchanges ?code= automatically during createClient() and fires
      // SIGNED_IN via onAuthStateChange above.
      //
      // If ANY OAuth signal is present:
      //   • Do NOT run anonymous sign-in — the Google session is in flight.
      //   • Do NOT set authError — it would show "Guest sign-in failed".
      //   • Keep loading=true — onAuthStateChange will call setLoading(false).
      //   • Only add a brief PWA delay + URL cleanup, then exit.
      const isOAuthReturn = detectOAuthCallback()

      const oauthErr = consumeOAuthError()
      if (oauthErr) {
        // consumeOAuthError also called replaceState, so URL is clean.
        if (oauthErr.code === 'identity_already_exists') {
          setGoogleAlreadyLinked(true)
          setAuthError('This Google account is already linked. Use "Sign in with Google" below.')
        } else {
          setAuthError(oauthErr.description || oauthErr.code || 'Sign-in failed')
        }
        // An error redirect means OAuth failed — no session is coming.
        // Fall through to anonymous sign-in below.
      }

      if (isOAuthReturn && !oauthErr) {
        // Genuine OAuth success return.  Let Supabase finish — do not touch
        // authError, do not run anonymous sign-in, keep loading=true.
        if (isStandalonePWA()) {
          // PWA standalone needs a tick for the async PKCE exchange to settle.
          await new Promise(r => setTimeout(r, 150))
        }
        // Clean ?code= / #access_token from the URL.
        window.history.replaceState(null, '', window.location.pathname)

        // Give onAuthStateChange up to 8 s to deliver the session before
        // giving up and falling back to a guest sign-in.
        await new Promise(r => setTimeout(r, 8000))
        if (cancelled) return

        // Re-check: if session arrived in the 8 s window we're done.
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (session?.user) return  // onAuthStateChange already handled state

        // 8 s passed and still no session — exchange silently failed.
        console.warn('[Auth] OAuth return: no session after 8 s, falling back to guest')
        setOauthProcessing(false)
        // Fall through to anonymous sign-in below.
      } else {
        // Normal (non-OAuth) load or OAuth error load: try getSession first.
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (cancelled) return

        if (sessionError) {
          console.error('[Auth] getSession failed:', sessionError.message)
          // Don't set authError — session fetch failure shouldn't lock the button.
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
      }

      // ── Anonymous sign-in fallback ────────────────────────────────────────────
      // Only reached for:
      //   (a) fresh visitors with no session
      //   (b) OAuth error returns (oauthErr is set — error already shown)
      //   (c) OAuth success with no session after 8 s safety timeout
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
        // Surface the error only after all retries and only when not in an
        // OAuth flow — prevents locking the sign-in button mid-redirect.
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
    setOauthProcessing(true)
    const safetyTimer = setTimeout(() => setOauthProcessing(false), 3000)

    const { data, error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: {
        redirectTo: REDIRECT_URL,
        scopes: 'email profile',
        skipNonceCheck: true,
      },
    })
    if (error) {
      clearTimeout(safetyTimer)
      setOauthProcessing(false)
      console.error('[Auth] linkGoogle failed:', error.message)
      return { data, error }
    }
    if (data?.url) {
      markOAuthPending()
      window.location.href = data.url
      return { data, error: null }
    }
    clearTimeout(safetyTimer)
    setOauthProcessing(false)
    return { data, error: { message: 'No OAuth URL returned from Supabase' } }
  }, [user, authError, signInAnonymously]) // eslint-disable-line react-hooks/exhaustive-deps

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
    oauthProcessing,
    signInAnonymously,
    signInWithGoogle,
    linkGoogle,
    signOut,
  }
}
