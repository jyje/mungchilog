type Environment = NodeJS.ProcessEnv;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const CLIENT_PAGE_PATHS = new Set(["/", "/login", "/pending", "/trips", "/import", "/new", "/admin", "/gallery", "/invite"]);

/**
 * Returns the Vite origin to use after an OIDC callback during local
 * development. The identity provider still calls the registered API callback
 * on :3000, then the server redirects the authenticated browser to Vite for
 * hot-module replacement.
 */
export function localWebOrigin(env: Environment = process.env): string | null {
  if (env.NODE_ENV !== "development" || !env.LOCAL_WEB_ORIGIN) return null;

  try {
    const origin = new URL(env.LOCAL_WEB_ORIGIN);
    if (origin.protocol !== "http:" || !LOOPBACK_HOSTS.has(origin.hostname)) return null;
    return origin.origin;
  } catch {
    return null;
  }
}

/**
 * Origins permitted to mutate an authenticated session. The configured OIDC
 * callback remains the primary origin. During local development, the Vite
 * origin is added only when it is an explicit HTTP loopback address.
 */
export function allowedSameOrigins(env: Environment = process.env): string[] {
  let callbackOrigin: string | null = null;
  try {
    callbackOrigin = env.OIDC_REDIRECT_URI ? new URL(env.OIDC_REDIRECT_URI).origin : null;
  } catch {
    callbackOrigin = null;
  }
  if (!callbackOrigin) return [];

  const origins = [callbackOrigin];
  const viteOrigin = localWebOrigin(env);
  if (viteOrigin && viteOrigin !== callbackOrigin) origins.push(viteOrigin);
  return origins;
}

export function localWebRedirect(path: "/pending" | "/trips", env: Environment = process.env): string {
  const origin = localWebOrigin(env);
  return origin ? new URL(path, origin).toString() : path;
}

/**
 * Redirect a direct browser navigation from the development API port to the
 * Vite page server. API, OIDC, health, and static asset paths deliberately
 * return null so the server keeps handling them locally.
 */
export function localWebPageRedirect(pathname: string, search = "", env: Environment = process.env): string | null {
  const origin = localWebOrigin(env);
  const isTripPage = pathname.startsWith("/trips/") && pathname.length > "/trips/".length;
  if (!origin || (!CLIENT_PAGE_PATHS.has(pathname) && !isTripPage)) return null;

  const target = new URL(pathname, origin);
  target.search = search;
  return target.toString();
}
