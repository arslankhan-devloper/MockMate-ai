// Minimal URL + browser-history routing for MockMate.
//
// The app renders one "page" at a time from local state. Without syncing that
// state to the URL, a refresh always reset the user to the landing page and the
// browser Back/Forward buttons could not move between screens.
//
// This hook keeps a single source of truth: the current page maps to a hash
// route (`#/dashboard`, `#/report/<id>`, ...). Navigating pushes a history
// entry, redirects replace the current one (so guards don't spam the back
// stack), and the browser Back/Forward buttons are handled through
// `popstate`/`hashchange`. An optional `/`-separated tail after the page token
// is exposed as `param`, which lets a page deep-link to a specific record
// (e.g. a saved interview report) without a server-side route.
//
// Hash routing is used on purpose: it needs no server-side SPA fallback and no
// extra dependency, so it behaves identically in dev, preview and static hosts.

import { useCallback, useEffect, useState } from 'react'

export interface NavigateOptions {
  /**
   * Replace the current history entry instead of pushing a new one. Use this
   * for redirects and guards (session/role/profile gates) so Back does not get
   * trapped bouncing between the redirecting page and its target.
   */
  replace?: boolean
  /**
   * Optional record identifier rendered after the page token (`#/report/<id>`).
   * Omitted for the many routes that need no sub-identifier.
   */
  param?: string
}

export interface ParsedHash {
  page: string
  param: string
}

export function parseHash(hash: string): ParsedHash {
  const raw = hash.replace(/^#\/?/, '').trim()
  if (!raw) {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname.replace(/^\/+|\/+$/g, '')
      if (pathname === 'admin/login' || pathname === 'admin') {
        return { page: 'admin-login', param: '' }
      }
    }
    return { page: '', param: '' }
  }
  const separator = raw.indexOf('/')
  if (separator === -1) {
    if (raw === 'admin') return { page: 'admin-login', param: '' }
    return { page: raw, param: '' }
  }
  const prefix = raw.slice(0, separator)
  const rest = raw.slice(separator + 1)
  if (prefix === 'admin') {
    if (rest === 'login') return { page: 'admin-login', param: '' }
    return { page: `admin-${rest}`, param: '' }
  }
  return { page: prefix, param: rest }
}

export function pageFromHash(hash: string): string {
  return parseHash(hash).page
}

export function hashForPage(page: string, param?: string): string {
  if (page === 'admin-login') {
    return param ? `#/admin/login/${param}` : `#/admin/login`
  }
  if (page.startsWith('admin-')) {
    const sub = page.slice(6)
    return param ? `#/admin/${sub}/${param}` : `#/admin/${sub}`
  }
  return param ? `#/${page}/${param}` : `#/${page}`
}

export interface HashRoute<T extends string> {
  page: T
  param: string
  navigate: (page: T, options?: NavigateOptions) => void
}

export function useHashRoute<T extends string>(
  validPages: readonly T[],
  fallback: T,
): HashRoute<T> {
  const isValid = useCallback(
    (value: string): value is T => (validPages as readonly string[]).includes(value),
    [validPages],
  )

  const readRoute = useCallback((): { page: T; param: string } => {
    if (typeof window === 'undefined') return { page: fallback, param: '' }
    const parsed = parseHash(window.location.hash)
    if (!isValid(parsed.page)) return { page: fallback, param: '' }
    return { page: parsed.page, param: parsed.param }
  }, [fallback, isValid])

  const [route, setRoute] = useState<{ page: T; param: string }>(readRoute)

  const navigate = useCallback((next: T, options?: NavigateOptions) => {
    const param = options?.param ?? ''
    if (typeof window === 'undefined') {
      setRoute({ page: next, param })
      return
    }
    const target = hashForPage(next, param)
    if (options?.replace) {
      window.history.replaceState(null, '', target)
    } else if (window.location.hash !== target) {
      window.history.pushState(null, '', target)
    }
    setRoute({ page: next, param })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Normalise the first URL (empty or unknown hash) without adding a history
    // entry, so the address bar always shows where the user actually is. The
    // param is preserved so a deep-linked report survives a reload.
    const initial = readRoute()
    const normalized = hashForPage(initial.page, initial.param)
    if (window.location.hash !== normalized) {
      window.history.replaceState(null, '', normalized)
    }

    const sync = () => setRoute(readRoute())
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [readRoute])

  return { page: route.page, param: route.param, navigate }
}
