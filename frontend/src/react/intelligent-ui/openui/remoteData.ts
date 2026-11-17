import { useEffect, useState } from 'react';

export const MEDIA_API = '/api/v2/intelligent-ui';
const requests = new Map<string, { at: number; promise: Promise<unknown> }>();

export function fetchRemote<T>(path: string): Promise<T> {
  if (!path.startsWith(`${MEDIA_API}/`)) return Promise.reject(new Error('Invalid media endpoint'));
  const hit = requests.get(path);
  if (hit && Date.now() - hit.at < 300_000) return hit.promise as Promise<T>;
  const promise = fetch(path, { credentials: 'same-origin', signal: AbortSignal.timeout(15000) }).then(async (response) => {
    if (!response.ok) throw new Error(`Media service ${response.status}`);
    return response.json() as Promise<T>;
  }).catch((error) => { requests.delete(path); throw error; });
  if (requests.size >= 256) requests.delete(requests.keys().next().value!);
  requests.set(path, { at: Date.now(), promise });
  return promise;
}

/** Debounce changing model text and ignore responses from earlier queries. */
export function useRemote<T>(path: string | null) {
  const [result, setResult] = useState<{ path: string; data?: T; error?: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!path) return;
    let active = true;
    const timer = setTimeout(() => {
      fetchRemote<T>(path).then((data) => {
        if (active) setResult({ path, data });
      }).catch(() => { if (active) setResult({ path, error: true }); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [path, revision]);
  const current = result?.path === path ? result : null;
  return {
    data: current?.data,
    error: Boolean(current?.error),
    loading: Boolean(path) && !current,
    retry: () => { if (path) requests.delete(path); setResult(null); setRevision((previous) => previous + 1); },
  };
}

export function localImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(`${MEDIA_API}/image?`)) return null;
  try {
    const url = new URL(value, 'https://app.topodrive.top');
    return url.origin === 'https://app.topodrive.top' && url.pathname === `${MEDIA_API}/image` ? value : null;
  } catch { return null; }
}
