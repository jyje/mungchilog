const DEVELOPMENT_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "mungchilog.dev.jyje.online",
]);

export function canAccessGallery(hostname: string, isDevelopmentBuild: boolean) {
  return isDevelopmentBuild || DEVELOPMENT_HOSTS.has(hostname.toLowerCase());
}

export function canAccessCurrentGallery() {
  return canAccessGallery(window.location.hostname, import.meta.env.DEV);
}
