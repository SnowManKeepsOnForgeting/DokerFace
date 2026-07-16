import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { describe, beforeAll, afterEach, afterAll, expect, it } from 'vitest';
import { loginApiV1AuthLoginPost } from '../contracts/rest';
import { ApiError } from '../api/client';
import '../api/client'; // Import client config

const server = setupServer(
  http.post('http://localhost:8080/api/v1/auth/login', () => {
    return HttpResponse.json(
      { detail: 'Invalid credentials' },
      { status: 401 }
    );
  })
);

describe('API Client Error Normalization', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('normalizes 401 errors into ApiError', async () => {
    try {
      await loginApiV1AuthLoginPost({
        body: { login_name: 'wrong', password: 'password' },
      });
      expect.fail('Should throw an ApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(401);
      expect(err.message).toBe('Invalid credentials');
      expect(err.code).toBe('INVALID_CREDENTIALS');
    }
  });
});
