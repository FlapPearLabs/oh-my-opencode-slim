/**
 * Validates whether a given string is a non-empty session identifier.
 * Live hook verification round 5.
 */
export function isValidSessionId(id: string): boolean {
  return typeof id === 'string' && id.trim().length > 0;
}
