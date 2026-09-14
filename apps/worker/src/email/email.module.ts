import { Module } from '@nestjs/common';
import { EmailProcessor } from './email.processor';
import { LogMailerProvider } from './log-mailer.provider';

@Module({
  providers: [EmailProcessor, LogMailerProvider],
  exports: [LogMailerProvider],
})
export class EmailModule {}