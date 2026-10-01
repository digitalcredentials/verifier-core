import { describe, it, expect } from 'vitest';
import { BuiltinHttpGetService } from './builtin-http-get-service.js';

describe('BuiltinHttpGetService', () => {
  it('returns an HttpGetService interface', () => {
    const service = BuiltinHttpGetService();
    expect(service).toHaveProperty('get');
    expect(typeof service.get).toBe('function');
  });

  // Note: Full fetch integration tests are covered by smoke tests
  // and registry handler tests using FakeHttpGetService.
});
