import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button, Spinner, ThemeSelector } from '@librechat/client';
import { useVerifyEmailMutation, useResendVerificationEmail } from '~/data-provider';
import { useLocalize } from '~/hooks';

function RequestPasswordReset() {
  const navigate = useNavigate();
  const localize = useLocalize();
  const [params] = useSearchParams();

  const [countdown, setCountdown] = useState<number>(3);
  const [headerText, setHeaderText] = useState<string>('');
  const [showResendLink, setShowResendLink] = useState<boolean>(false);
  const [verificationStatus, setVerificationStatus] = useState<boolean>(false);
  const token = useMemo(() => params.get('token') || '', [params]);
  const email = useMemo(() => params.get('email') || '', [params]);

  const countdownRedirect = useCallback(() => {
    setCountdown(3);
    const timer = setInterval(() => {
      setCountdown((prevCountdown) => {
        if (prevCountdown <= 1) {
          clearInterval(timer);
          navigate('/c/new', { replace: true });
          return 0;
        }
        return prevCountdown - 1;
      });
    }, 1000);
  }, [navigate]);

  /** A failed verification has nowhere to send the user, so it clears the
   *  countdown: the "redirecting" line renders while it is above zero, and the
   *  resend prompt appears only once it reaches zero. Leaving it at its initial
   *  value promised a redirect that no timer was running and hid the one action
   *  left on the screen. */
  const showFailure = useCallback((text: string) => {
    setHeaderText(text);
    setCountdown(0);
    setShowResendLink(true);
    setVerificationStatus(true);
  }, []);

  const verifyEmailMutation = useVerifyEmailMutation({
    onSuccess: () => {
      setHeaderText(localize('com_auth_email_verification_success') + ' 🎉');
      setVerificationStatus(true);
      countdownRedirect();
    },
    onError: (_error: unknown) => {
      showFailure(localize('com_auth_email_verification_failed') + ' 😢');
    },
  });

  const resendEmailMutation = useResendVerificationEmail({
    onSuccess: () => {
      setHeaderText(localize('com_auth_email_resent_success') + ' 📧');
      countdownRedirect();
    },
    onError: () => {
      showFailure(localize('com_auth_email_resent_failed') + ' 😢');
    },
    onMutate: () => setShowResendLink(false),
  });

  const handleResendEmail = () => {
    resendEmailMutation.mutate({ email });
  };

  useEffect(() => {
    if (verificationStatus || verifyEmailMutation.isLoading) {
      return;
    }

    if (token && email) {
      verifyEmailMutation.mutate({ email, token });
    } else {
      showFailure(
        email
          ? localize('com_auth_email_verification_failed_token_missing') + ' 😢'
          : localize('com_auth_email_verification_invalid') + ' 🤨',
      );
    }
  }, [token, email, verificationStatus, verifyEmailMutation, localize, showFailure]);

  const VerificationSuccess = () => (
    <div className="flex flex-col items-center justify-center">
      <h1 className="mb-4 text-center text-3xl font-semibold text-text-primary">{headerText}</h1>
      {countdown > 0 && (
        <p className="text-center text-lg text-text-secondary">
          {localize('com_auth_email_verification_redirecting', { 0: countdown.toString() })}
        </p>
      )}
      {showResendLink && countdown === 0 && (
        <p className="text-center text-lg text-text-secondary">
          {localize('com_auth_email_verification_resend_prompt')}
          <Button
            type="button"
            variant="link"
            className="ml-2 inline h-auto p-0 text-link"
            onClick={handleResendEmail}
            disabled={resendEmailMutation.isLoading}
          >
            {localize('com_auth_email_resend_link')}
          </Button>
        </p>
      )}
    </div>
  );

  const VerificationInProgress = () => (
    <div className="flex flex-col items-center justify-center">
      <h1 className="mb-4 text-center text-3xl font-semibold text-text-primary">
        {localize('com_auth_email_verification_in_progress')}
      </h1>
      <div className="mt-4 flex justify-center">
        <Spinner className="h-8 w-8 text-accent-primary" />
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-primary pt-6 sm:pt-0">
      <div className="absolute bottom-0 left-0 m-4">
        <ThemeSelector />
      </div>
      {verificationStatus ? <VerificationSuccess /> : <VerificationInProgress />}
    </div>
  );
}

export default RequestPasswordReset;
