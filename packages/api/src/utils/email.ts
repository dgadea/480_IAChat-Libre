import { logger } from '@librechat/data-schemas';

/**
 * Check if email configuration is set
 * @returns Returns `true` if Mailgun, SendGrid or SMTP is properly configured
 *
 * What this answers is whether the deployment can send at all: registration
 * marks a new account verified outright when it cannot, so a provider missing
 * here silently disables email verification rather than failing loudly.
 */
export function checkEmailConfig(): boolean {
  const hasMailgunConfig =
    !!process.env.MAILGUN_API_KEY && !!process.env.MAILGUN_DOMAIN && !!process.env.EMAIL_FROM;

  const hasSendGridConfig = !!process.env.SENDGRID_API_KEY && !!process.env.EMAIL_FROM;

  const hasSMTPConfig =
    (!!process.env.EMAIL_SERVICE || !!process.env.EMAIL_HOST) && !!process.env.EMAIL_FROM;

  if (hasSMTPConfig) {
    const hasUsername = !!process.env.EMAIL_USERNAME;
    const hasPassword = !!process.env.EMAIL_PASSWORD;
    if (hasUsername !== hasPassword) {
      logger.warn(
        '[checkEmailConfig] EMAIL_USERNAME and EMAIL_PASSWORD must both be set for authenticated SMTP, or both omitted for unauthenticated SMTP.',
      );
    }
  }

  return hasMailgunConfig || hasSendGridConfig || hasSMTPConfig;
}
