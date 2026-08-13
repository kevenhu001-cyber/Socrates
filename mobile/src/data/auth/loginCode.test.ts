import { isValidLoginCode, normalizeLoginCode } from './loginCode';

describe('email login code', () => {
  it('normalizes the server alphabet to uppercase eight-character codes', () => {
    expect(normalizeLoginCode('ab0cd1efgh234')).toBe('ABCDEFGH');
    expect(normalizeLoginCode('o1il-2345')).toBe('2345');
  });

  it('accepts only the eight-character server code format', () => {
    expect(isValidLoginCode('ABCD2345')).toBe(true);
    expect(isValidLoginCode('ABCD1234')).toBe(false);
    expect(isValidLoginCode('ABC2345')).toBe(false);
    expect(isValidLoginCode('ABCD23456')).toBe(false);
  });
});
