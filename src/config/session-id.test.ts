import { describe, expect, test } from 'bun:test';
import { isValidSessionId } from './session-id';

describe('isValidSessionId', () => {
  test('validates non-empty strings', () => {
    expect(isValidSessionId('sess_12345')).toBe(true);
    expect(isValidSessionId('')).toBe(false);
    expect(isValidSessionId('   ')).toBe(false);
  });
});
