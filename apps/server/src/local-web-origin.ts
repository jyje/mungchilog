type Environment = NodeJS.ProcessEnv;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

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

export function localWebRedirect(path: "/pending" | "/trips", env: Environment = process.env): string {
  const origin = localWebOrigin(env);
  return origin ? new URL(path, origin).toString() : path;
}
