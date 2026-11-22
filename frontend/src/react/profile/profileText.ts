import { t as translate } from '../../ui/legacyI18n.ts';

export function profileText(key: string, fallback: string): string {
  const value = translate(key);
  return value !== key ? value : fallback;
}
