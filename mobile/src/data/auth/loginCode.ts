/** Server-side codes deliberately omit ambiguous 0/O, 1/I/L characters. */
export const LOGIN_CODE_PATTERN = /^[A-HJ-KM-NP-Z2-9]{8}$/;

export function normalizeLoginCode(value: string): string {
  return value.toUpperCase().replace(/[^A-HJ-KM-NP-Z2-9]/g, '').slice(0, 8);
}

export function isValidLoginCode(value: string): boolean {
  return LOGIN_CODE_PATTERN.test(value);
}
