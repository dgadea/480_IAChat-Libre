import { MemoryRouter } from 'react-router-dom';
import { act, render, screen } from '@testing-library/react';
import VerifyEmail from '../VerifyEmail';

type MutationOptions = { onSuccess: () => void; onError: (error?: unknown) => void };

const mockNavigate = jest.fn();
const mockResend = jest.fn();
let verifyOptions: MutationOptions | undefined;

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  ThemeSelector: () => null,
}));

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string, values?: Record<string, string>): string =>
      values ? `${key}:${Object.values(values).join(',')}` : key,
}));

jest.mock('~/data-provider', () => ({
  useVerifyEmailMutation: (options: MutationOptions) => {
    verifyOptions = options;
    return { mutate: jest.fn(), isLoading: false };
  },
  useResendVerificationEmail: () => ({ mutate: mockResend, isLoading: false }),
}));

function renderPage(search = '?token=some-token&email=user%40example.com') {
  render(
    <MemoryRouter initialEntries={[`/verify${search}`]}>
      <VerifyEmail />
    </MemoryRouter>,
  );
}

describe('VerifyEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyOptions = undefined;
  });

  it('counts down and redirects on success', () => {
    jest.useFakeTimers();
    renderPage();

    act(() => verifyOptions?.onSuccess());
    expect(screen.getByText('com_auth_email_verification_redirecting:3')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(mockNavigate).toHaveBeenCalledWith('/c/new', { replace: true });
    jest.useRealTimers();
  });

  it('does not promise a redirect when verification fails', () => {
    renderPage();

    act(() => verifyOptions?.onError(new Error('bad token')));

    expect(screen.queryByText(/com_auth_email_verification_redirecting/)).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('offers the resend link when verification fails', () => {
    renderPage();

    act(() => verifyOptions?.onError(new Error('bad token')));

    const resend = screen.getByRole('button', { name: 'com_auth_email_resend_link' });
    act(() => resend.click());
    expect(mockResend).toHaveBeenCalledWith({ email: 'user@example.com' });
  });

  it('offers the resend link when the link carries no token', () => {
    renderPage('?email=user%40example.com');

    expect(
      screen.getByText(/com_auth_email_verification_failed_token_missing/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/com_auth_email_verification_redirecting/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_auth_email_resend_link' })).toBeInTheDocument();
  });
});
