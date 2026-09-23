import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import type { ApiResponse, PaginatedResponse } from '../../contracts';

/**
 * Global response envelope (plan §17). Wraps every successful controller
 * result as { data, meta? }. Controllers that already return an envelope
 * ({ data } or { data, meta }) pass through untouched.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T> | PaginatedResponse<T>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T> | PaginatedResponse<T>> {
    return next.handle().pipe(
      map((result) => {
        if (result !== null && typeof result === 'object' && 'data' in result) {
          return result as ApiResponse<T>;
        }
        return { data: result ?? ({} as T) };
      }),
    );
  }
}
