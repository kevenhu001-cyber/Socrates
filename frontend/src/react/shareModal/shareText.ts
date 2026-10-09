import { t as translate } from '../legacy/gateway.ts';

export function shareText(key: string, fallback: string): string {
  const value = translate(key);
  return value !== key ? value : fallback;
}
