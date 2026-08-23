export function initialAdminEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  // ADMIN_EMAIL remains a temporary compatibility path for existing local
  // development files and deployed secrets. New installations should use the
  // explicit INITIAL_ADMIN_EMAIL secret key. Both values accept a
  // comma-separated list so a fresh deployment can safely nominate more than
  // one administrator before any identity has signed in.
  const configured = env.INITIAL_ADMIN_EMAIL ?? env.ADMIN_EMAIL;
  if (!configured) return [];

  return [...new Map(
    configured
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean)
      .map((email) => [email.toLowerCase(), email.toLowerCase()] as const),
  ).values()];
}

export function shouldSeedInitialAdminCandidates({
  configuredInitialAdminEmails,
  hasApprovedAdmin,
}: {
  configuredInitialAdminEmails: readonly string[];
  hasApprovedAdmin: boolean;
}): boolean {
  return configuredInitialAdminEmails.length > 0 && !hasApprovedAdmin;
}

export function canActivateInitialAdminCandidate({
  email,
  emailIsVerified,
  configuredInitialAdminEmails,
  isPendingAdministratorCandidate,
}: {
  email: string;
  emailIsVerified: boolean;
  configuredInitialAdminEmails: readonly string[];
  isPendingAdministratorCandidate: boolean;
}): boolean {
  return emailIsVerified
    && isPendingAdministratorCandidate
    && configuredInitialAdminEmails.some((configuredEmail) => email.toLowerCase() === configuredEmail.toLowerCase());
}
