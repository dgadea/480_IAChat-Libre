import { useEffect, useState } from 'react';
import { Button } from '@librechat/client';
import { useResendVerificationEmail } from '~/data-provider';
import { useLocalize } from '~/hooks';

/** Paces the button below the server's `verifyEmailLimiter`, so a second click does not burn the quota. */
const COOLDOWN_SECONDS = 60;

type ResendStatus = 'idle' | 'sent' | 'failed';

type ResendProps = {
  getEmail: () => string | undefined;
  /** The address registration just sent a link to; the link counts as the first send. */
  sentTo?: string;
  onResend?: () => void;
};

export default function Resend({ getEmail, sentTo, onResend }: ResendProps) {
  const localize = useLocalize();
  const [status, setStatus] = useState<ResendStatus>('idle');
  const [cooldown, setCooldown] = useState<number>(sentTo ? COOLDOWN_SECONDS : 0);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const resend = useResendVerificationEmail({
    onMutate: () => onResend?.(),
    onSuccess: () => {
      setStatus('sent');
      setCooldown(COOLDOWN_SECONDS);
    },
    onError: () => {
      setStatus('failed');
      setCooldown(COOLDOWN_SECONDS);
    },
  });

  const handleResend = () => {
    const email = getEmail()?.trim();
    if (!email) {
      return;
    }
    resend.mutate({ email });
  };

  const label =
    cooldown > 0
      ? localize('com_auth_email_resend_in', { 0: cooldown.toString() })
      : localize('com_auth_email_resend_link');

  return (
    <div role="status" className="mt-2 text-center text-sm text-text-secondary">
      {sentTo && (
        <p className="mb-2">{localize('com_auth_email_verification_sent', { 0: sentTo })}</p>
      )}
      {status === 'sent' && <p className="mb-2">{localize('com_auth_email_resent_success')}</p>}
      {status === 'failed' && (
        <p className="mb-2 text-text-destructive">{localize('com_auth_email_resent_failed')}</p>
      )}
      <p>
        {localize('com_auth_email_verification_resend_prompt')}{' '}
        <Button
          type="button"
          variant="link"
          className="inline h-auto p-0 text-link"
          onClick={handleResend}
          disabled={resend.isLoading || cooldown > 0}
        >
          {label}
        </Button>
      </p>
    </div>
  );
}
