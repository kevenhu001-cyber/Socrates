import { t as translate } from '../legacy/gateway.ts';

export function profileText(key: string, fallback: string): string {
  const value = translate(key);
  return value !== key ? value : fallback;
}
