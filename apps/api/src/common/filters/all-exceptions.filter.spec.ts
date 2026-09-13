import { ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';
import { Response } from 'express';
import { AllExceptionsFilter } from './all-exceptions.filter';

interface Filtered {
  filter: AllExceptionsFilter;
  status: jest.Mock;
  json: jest.Mock;
  host: ArgumentsHost;
}

function buildFilter(): Filtered {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json }) as jest.Mock;
  const response = { status } as unknown as Response;
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { filter: new AllExceptionsFilter(), status, json, host };
}

describe('AllExceptionsFilter (plan §17 error envelope)', () => {
  it('emits { error: { code, message } } for an expected exception', () => {
    const { filter, status, json, host } = buildFilter();
    filter.catch(new BadRequestException('boom'), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'VALIDATION_ERROR', message: 'boom' },
    });
  });

  it('maps field-level validation arrays into details and a fixed message', () => {
    const { filter, status, json, host } = buildFilter();
    filter.catch(
      new BadRequestException({
        message: ['sku must not be empty', 'price must be positive'],
        error: 'Bad Request',
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: ['sku must not be empty', 'price must be positive'],
      },
    });
  });

  it('masks unknown exceptions as INTERNAL_ERROR', () => {
    const spy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { filter, status, json, host } = buildFilter();
    filter.catch(new Error('secret internals'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
    spy.mockRestore();
  });
});
