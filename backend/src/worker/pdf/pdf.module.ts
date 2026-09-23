import { Module } from '@nestjs/common';
import { PdfProcessor } from './pdf.processor';
import { DocumentFileService } from './document-file.service';

@Module({
  providers: [PdfProcessor, DocumentFileService],
})
export class PdfModule {}