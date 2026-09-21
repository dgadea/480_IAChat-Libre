import type { AxiosInstance } from 'axios';
import { sendEmailViaSendGrid } from './sendgrid';

interface RecordedCall {
  url: string;
  body: Record<string, unknown>;
  config: { headers: Record<string, string> };
}

function stubClient(
  response: { status: number; data?: unknown; headers?: Record<string, string> },
  calls: RecordedCall[] = [],
): AxiosInstance {
  const post = (url: string, body: RecordedCall['body'], config: RecordedCall['config']) => {
    calls.push({ url, body, config });
    return Promise.resolve(response);
  };
  return { post } as unknown as AxiosInstance;
}

const message = {
  apiKey: 'SG.test-key',
  from: { email: 'hello@480bureau.com', name: '480' },
  to: { email: 'someone@example.com', name: 'Someone' },
  subject: 'Verify your email',
  html: '<p>hi</p>',
};

describe('sendEmailViaSendGrid', () => {
  it('rejects a missing API key before making a request', async () => {
    const calls: RecordedCall[] = [];
    await expect(
      sendEmailViaSendGrid({
        ...message,
        apiKey: '',
        client: stubClient({ status: 202 }, calls),
      }),
    ).rejects.toThrow('SendGrid API key is required');
    expect(calls).toHaveLength(0);
  });

  it('posts the v3 payload with bearer auth and click tracking off', async () => {
    const calls: RecordedCall[] = [];
    await sendEmailViaSendGrid({
      ...message,
      client: stubClient({ status: 202, headers: { 'x-message-id': 'abc123' } }, calls),
    });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(call.config.headers.Authorization).toBe('Bearer SG.test-key');
    expect(call.body).toMatchObject({
      personalizations: [{ to: [message.to] }],
      from: message.from,
      subject: message.subject,
      content: [{ type: 'text/html', value: message.html }],
      tracking_settings: { click_tracking: { enable: false } },
    });
  });

  it('reports the recipient and the message id on a 202', async () => {
    const result = await sendEmailViaSendGrid({
      ...message,
      client: stubClient({ status: 202, headers: { 'x-message-id': 'abc123' } }),
    });
    expect(result).toEqual({
      accepted: ['someone@example.com'],
      messageId: 'abc123',
      statusCode: 202,
    });
  });

  it("surfaces SendGrid's own error detail rather than the bare status", async () => {
    await expect(
      sendEmailViaSendGrid({
        ...message,
        client: stubClient({
          status: 403,
          data: {
            errors: [
              {
                field: 'from',
                message: 'The from address does not match a verified Sender Identity.',
              },
            ],
          },
        }),
      }),
    ).rejects.toThrow(
      'SendGrid responded 403 — from: The from address does not match a verified Sender Identity.',
    );
  });

  it('falls back to the status when the body carries no errors', async () => {
    await expect(
      sendEmailViaSendGrid({ ...message, client: stubClient({ status: 500, data: {} }) }),
    ).rejects.toThrow('SendGrid responded 500');
  });
});
