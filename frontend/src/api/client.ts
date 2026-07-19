import { client } from '../contracts/rest/client.gen';

export interface ApiValidationError {
  field: string;
  message: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  status: number;
  validationErrors?: ApiValidationError[];
}

export class ApiError extends Error {
  public status: number;
  public code: string;
  public validationErrors?: ApiValidationError[];

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.status = payload.status;
    this.code = payload.code;
    this.validationErrors = payload.validationErrors;
  }
}

// Configure base credentials, URL mapping, and enable throwOnError globally
const isDev = import.meta.env.DEV;
client.setConfig({
  baseUrl: isDev ? 'http://localhost:8080' : '',
  credentials: 'include',
  throwOnError: true,
  responseStyle: 'data',
});

// Error interceptor to catch failed requests and normalize them
client.interceptors.error.use((error, response) => {
  let message = 'An unexpected error occurred';
  let code = 'UNKNOWN_ERROR';
  let validationErrors: ApiValidationError[] | undefined;

  const status = response ? response.status : 0;

  if (isRecord(error)) {
    const detail = error.detail;
    if (typeof detail === 'string') {
      message = detail;
      code = detail.toUpperCase().replace(/\s+/g, '_');
    } else if (Array.isArray(detail)) {
      message = 'Validation failed';
      code = 'VALIDATION_ERROR';
      validationErrors = detail.map((item) => {
        const validation = isRecord(item) ? item : {};
        const location = Array.isArray(validation.loc) ? validation.loc : [];
        return {
          field: location.slice(1).join('.') || 'unknown',
          message: typeof validation.msg === 'string' ? validation.msg : 'invalid value',
        };
      });
    } else if (typeof error.message === 'string') {
      message = error.message;
    }
  } else if (typeof error === 'string') {
    message = error;
  }

  return new ApiError({
    status,
    code,
    message,
    validationErrors,
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
