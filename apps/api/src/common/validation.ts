import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@piano-daily/shared';
import { AppException } from './http-exception.filter';

type Issue = {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
};

export interface ValidationDetail {
  path: string;
  message: string;
}

/** `exceptionFactory` của `StandardSchemaValidationPipe`: 400 `VALIDATION_FAILED`, `details` = `[{path, message}]`. */
export function validationExceptionFactory(issues: readonly Issue[]): AppException {
  const details: ValidationDetail[] = issues.map((issue) => ({
    path: (issue.path ?? [])
      .map((segment) => String(typeof segment === 'object' && segment !== null ? segment.key : segment))
      .join('.'),
    message: issue.message,
  }));
  return new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, details);
}
