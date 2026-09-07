import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge guard for private areas + session-flag maintenance (Next 16 renamed
 * `middleware` to `proxy`). The httpOnly refresh cookie is readable here
 * (httpOnly blocks browser JS, not the server):
 *
 * 1. Unauthenticated hits on private routes redirect to login instantly,
 *    skipping the HTML shell → client bootstrap → redirect dance. This is a
 *    UX fast-path only — real auth (JWT + membership) is still enforced by
 *    the api-gateway on every request.
 * 2. A readable `wriven_session` flag cookie mirrors the presence of the
 *    refresh cookie so `Providers` can skip the doomed `/auth/me` +
 *    `/auth/refresh` round trips for anonymous visitors on public pages.
 */
const PRIVATE_PATH = /^\/(dashboard|w|workspaces|profile|billing)(\/|$)/;

export function proxy(req: NextRequest) {
  const hasSession = !!req.cookies.get('refresh_token');

  if (PRIVATE_PATH.test(req.nextUrl.pathname) && !hasSession) {
    const login = new URL('/login', req.url);
    login.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  const res = NextResponse.next();
  if (hasSession) {
    res.cookies.set('wriven_session', '1', {
      path: '/',
      sameSite: 'lax',
      // Outlives any realistic session; proxy keeps it accurate per request.
      maxAge: 60 * 60 * 24 * 365,
    });
  } else if (req.cookies.get('wriven_session')) {
    // Session ended (logout/expiry) — drop the stale flag so public pages
    // go back to skipping the auth bootstrap.
    res.cookies.delete('wriven_session');
  }
  return res;
}

export const config = {
  // Skip Next internals, the client's own API routes, and static assets.
  matcher: ['/((?!_next/static|_next/image|api|favicon.ico|.*\\..*).*)'],
};
