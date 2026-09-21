import { checkEmailConfig } from './email';

const MAIL_VARS = [
  'MAILGUN_API_KEY',
  'MAILGUN_DOMAIN',
  'SENDGRID_API_KEY',
  'EMAIL_SERVICE',
  'EMAIL_HOST',
  'EMAIL_USERNAME',
  'EMAIL_PASSWORD',
  'EMAIL_FROM',
];

const savedEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...savedEnv };
  for (const name of MAIL_VARS) {
    delete process.env[name];
  }
});

afterAll(() => {
  process.env = savedEnv;
});

describe('checkEmailConfig', () => {
  it('is false when nothing is configured', () => {
    expect(checkEmailConfig()).toBe(false);
  });

  it('is true for SendGrid over HTTP, with no SMTP settings at all', () => {
    process.env.SENDGRID_API_KEY = 'SG.key';
    process.env.EMAIL_FROM = 'hello@example.com';
    expect(checkEmailConfig()).toBe(true);
  });

  it('is false for a SendGrid key with no sender address', () => {
    process.env.SENDGRID_API_KEY = 'SG.key';
    expect(checkEmailConfig()).toBe(false);
  });

  it('is true for SMTP', () => {
    process.env.EMAIL_HOST = 'smtp.example.com';
    process.env.EMAIL_FROM = 'hello@example.com';
    expect(checkEmailConfig()).toBe(true);
  });

  it('is true for Mailgun', () => {
    process.env.MAILGUN_API_KEY = 'key';
    process.env.MAILGUN_DOMAIN = 'mg.example.com';
    process.env.EMAIL_FROM = 'hello@example.com';
    expect(checkEmailConfig()).toBe(true);
  });
});
