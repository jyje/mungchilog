export function oidcPostLogoutRedirectUri(redirectUri: string): string {
  const logoutCompleteUri = new URL(redirectUri);
  logoutCompleteUri.pathname = "/auth/logout-complete";
  logoutCompleteUri.search = "";
  logoutCompleteUri.hash = "";
  return logoutCompleteUri.toString();
}
