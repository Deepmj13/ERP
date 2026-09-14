import { Injectable, Logger } from '@nestjs/common';
import { MailMessage, MailProvider } from './mail-provider.interface';

/**
 * Local-dev provider: renders the envelope to the log. Swapping in a real
 * provider (plan §22) is a one-line change in the module wiring.
 */
@Injectable()
export class LogMailerProvider implements MailProvider {
  readonly name = 'log';
  private readonly logger = new Logger(LogMailerProvider.name);

  async send(message: MailMessage): Promise<void> {
    this.logger.log(
      `envelope(template=${message.template}, to=${message.to}, subject=${message.subject}, tenant=${message.tenantId})`,
    );
  }
}