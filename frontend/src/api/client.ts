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
});

// Error interceptor to catch failed requests and normalize them
client.interceptors.error.use((error, response) => {
  let message = 'An unexpected error occurred';
  let code = 'UNKNOWN_ERROR';
  let validationErrors: ApiValidationError[] | undefined;

  const status = response ? response.status : 0;

  if (error && typeof error === 'object') {
    const errObj = error as any;
    if (typeof errObj.detail === 'string') {
      message = errObj.detail;
      code = errObj.detail.toUpperCase().replace(/\s+/g, '_');
    } else if (Array.isArray(errObj.detail)) {
      message = 'Validation failed';
      code = 'VALIDATION_ERROR';
      validationErrors = errObj.detail.map((err: any) => ({
        field: Array.isArray(err.loc) ? err.loc.slice(1).join('.') : 'unknown',
        message: err.msg || 'invalid value',
      }));
    } else if (errObj.message) {
      message = errObj.message;
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
