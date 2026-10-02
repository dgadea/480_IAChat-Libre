const DEFAULT_LOGO_PATH = '/assets/logo.png';

interface BrandingEnv {
  EMAIL_LOGO_URL?: string;
  DOMAIN_CLIENT?: string;
}

/**
 * The absolute URL of the logo shown at the top of outgoing email. Mail clients
 * fetch it from outside the app, so it must be absolute: `EMAIL_LOGO_URL` wins,
 * otherwise it is the client's own `/assets/logo.png`, and without a client
 * domain there is no logo at all rather than a broken image.
 */
export function resolveEmailLogoUrl(env: BrandingEnv): string | undefined {
  const explicit = env.EMAIL_LOGO_URL?.trim();
  if (explicit) {
    return explicit;
  }
  const domain = env.DOMAIN_CLIENT?.trim().replace(/\/+$/, '');
  return domain ? `${domain}${DEFAULT_LOGO_PATH}` : undefined;
}
