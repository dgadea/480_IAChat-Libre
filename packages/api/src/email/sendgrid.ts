import axios from 'axios';
import type { AxiosInstance } from 'axios';

const SEND_URL = 'https://api.sendgrid.com/v3/mail/send';

export interface SendGridAddress {
  email: string;
  name?: string;
}

export interface SendGridMessage {
  apiKey: string;
  from: SendGridAddress;
  to: SendGridAddress;
  subject: string;
  html: string;
  /** Injected in tests, and by a caller that needs its own timeouts or proxy. */
  client?: AxiosInstance;
}

export interface SendGridResult {
  accepted: string[];
  messageId?: string;
  statusCode: number;
}

interface SendGridErrorBody {
  errors?: Array<{ message?: string; field?: string }>;
}

/**
 * Reads SendGrid's error envelope, which reports the real cause — an
 * unverified sender, a revoked key — in a list rather than in the status text.
 */
function describeFailure(status: number, data: unknown): string {
  const errors = (data as SendGridErrorBody | undefined)?.errors;
  if (!Array.isArray(errors) || errors.length === 0) {
    return `SendGrid responded ${status}`;
  }
  const detail = errors
    .map((error) => (error.field ? `${error.field}: ${error.message}` : error.message))
    .filter(Boolean)
    .join('; ');
  return detail ? `SendGrid responded ${status} — ${detail}` : `SendGrid responded ${status}`;
}

/**
 * Sends one message through SendGrid's HTTP API.
 *
 * The transport matters where SMTP is unavailable: several hosts block outbound
 * 25/465/587/2525 to keep from sourcing spam, and there the port never connects
 * no matter how correct the credentials are. This path is ordinary HTTPS.
 *
 * A send is accepted with `202` and an empty body; the id arrives in a header.
 */
export async function sendEmailViaSendGrid({
  apiKey,
  from,
  to,
  subject,
  html,
  client = axios,
}: SendGridMessage): Promise<SendGridResult> {
  if (!apiKey) {
    throw new Error('SendGrid API key is required');
  }

  const response = await client.post(
    SEND_URL,
    {
      personalizations: [{ to: [to] }],
      from,
      subject,
      content: [{ type: 'text/html', value: html }],
      tracking_settings: { click_tracking: { enable: false, enable_text: false } },
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      validateStatus: () => true,
    },
  );

  if (response.status < 200 || response.status >= 300) {
    throw new Error(describeFailure(response.status, response.data));
  }

  return {
    accepted: [to.email],
    messageId: response.headers?.['x-message-id'],
    statusCode: response.status,
  };
}
