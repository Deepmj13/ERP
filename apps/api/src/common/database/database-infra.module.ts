import { Global, Module } from '@nestjs/common';

import { DocumentNumberingService } from './document-numbering.service';

/**
 * Platform-level database infrastructure services (G-1). Consumed by every
 * module that assigns a user-visible document number (plan §12).
 */
@Global()
@Module({
  providers: [DocumentNumberingService],
  exports: [DocumentNumberingService],
})
export class DatabaseInfraModule {}