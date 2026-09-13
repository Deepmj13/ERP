import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ERROR_CODES, ErrorCode } from '@erp/api-contracts';

/**
 * Global error envelope (plan §17):
 *   { error: { code, message, details? } }
 * Every exception — expected or not — is normalized to this shape so the
 * Flutter client has exactly one error contract.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      let code: ErrorCode = this.codeFromStatus(status);
      let message = exception.message;
      let details: unknown;

      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        // Nest validation errors -> { message: string[] }.
        if (Array.isArray(b.message)) {
          code = ERROR_CODES.VALIDATION;
          message = 'Request validation failed';
          details = b.message;
        } else if (typeof b.message === 'string') {
          message = b.message;
        }
        if (b.error && typeof b.error === 'string') {
          // Preserve specific business codes only when explicitly set;
          // otherwise the HTTP-derived code is used.
        }
      }

      response.status(status).json({
        error: { code, message, ...(details !== undefined ? { details } : {}) },
      });
      return;
    }

    // Unknown error — do not leak internals. 500 + generic message.
    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : exception,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: ERROR_CODES.INTERNAL,
        message: 'An unexpected error occurred',
      },
    });
  }

  private codeFromStatus(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ERROR_CODES.VALIDATION;
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ERROR_CODES.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ERROR_CODES.RATE_LIMITED;
      default:
        return ERROR_CODES.INTERNAL;
    }
  }
}
