import { Logger } from '@nestjs/common';

import type { AppConfig } from '../../../config/app-config';

const sendMail = jest.fn();
const createTransport = jest.fn((options: unknown) => {
  void options;
  return { sendMail };
});

jest.mock('nodemailer', () => ({
  createTransport: (options: unknown) => createTransport(options),
}));

// jest.mock('nodemailer') above must be hoisted before this module loads it,
// so it is required here rather than imported at the top of the file.
/* eslint-disable @typescript-eslint/no-require-imports */
const { NodemailerGmailAdapter } =
  require('./nodemailer-gmail.adapter') as typeof import('./nodemailer-gmail.adapter');
/* eslint-enable @typescript-eslint/no-require-imports */

function buildAppConfig(): AppConfig {
  return {
    smtp: {
      host: 'smtp.gmail.com',
      port: 465,
      user: 'no-reply@example.com',
      password: 'super-secret-app-password',
      from: 'SoundHub <no-reply@example.com>',
    },
  } as AppConfig;
}

const MESSAGE = {
  to: 'ana.gomez@example.com',
  subject: 'Subject',
  html: '<p>html</p>',
  text: 'text',
};

describe('NodemailerGmailAdapter', () => {
  beforeEach(() => {
    createTransport.mockClear();
    sendMail.mockReset();
  });

  it('opens the transport on port 465 with secure true, the configured auth and 10s timeouts', () => {
    sendMail.mockResolvedValue({});

    new NodemailerGmailAdapter(buildAppConfig());

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: 'no-reply@example.com', pass: 'super-secret-app-password' },
        pool: false,
        connectionTimeout: 10_000,
        socketTimeout: 10_000,
      }),
    );
  });

  it('sends from, to, subject, html and text', async () => {
    sendMail.mockResolvedValue({});
    const adapter = new NodemailerGmailAdapter(buildAppConfig());

    const result = await adapter.send(MESSAGE);

    expect(result.isOk()).toBe(true);
    expect(sendMail).toHaveBeenCalledWith({
      from: 'SoundHub <no-reply@example.com>',
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      html: MESSAGE.html,
      text: MESSAGE.text,
    });
  });

  it('returns Err with a message that holds no credentials on a rejection', async () => {
    sendMail.mockRejectedValue(new Error('535 5.7.8 Username and Password not accepted'));
    const adapter = new NodemailerGmailAdapter(buildAppConfig());

    const result = await adapter.send(MESSAGE);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).not.toContain('super-secret-app-password');
      expect(result.error.message).not.toContain(MESSAGE.to);
    }
  });

  it('never logs the password or the recipient', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    sendMail.mockResolvedValue({});
    const adapter = new NodemailerGmailAdapter(buildAppConfig());

    await adapter.send(MESSAGE);

    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
