import { Logger } from '@nestjs/common';

import { LoggingEmailSender } from './logging-email-sender';

const MESSAGE = {
  to: 'ana.gomez@example.com',
  subject: 'Subject',
  html: '<p>html</p>',
  text: 'text body',
};

describe('LoggingEmailSender', () => {
  it('logs the subject and text with the recipient masked, and returns Ok', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const sender = new LoggingEmailSender();

    const result = await sender.send(MESSAGE);

    expect(result.isOk()).toBe(true);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const [line] = logSpy.mock.calls[0] as [string];
    expect(line).toContain('a***@example.com');
    expect(line).toContain(MESSAGE.subject);
    expect(line).toContain(MESSAGE.text);
    expect(line).not.toContain(MESSAGE.to);

    logSpy.mockRestore();
  });
});
