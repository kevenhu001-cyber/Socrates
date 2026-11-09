const PENDING_QUESTION_KEY = 'socrates:marketing-question';
let inMemoryQuestion: string | null = null;

/** Capture a question before auth routing, so a sign-in round trip won't lose it. */
export function captureMarketingQuestion(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('q')) return;

  const question = url.searchParams.get('q')?.trim() || '';
  if (question) {
    inMemoryQuestion = question;
    try { window.sessionStorage.setItem(PENDING_QUESTION_KEY, question); }
    catch { /* empty-catch: intentional — the in-memory copy covers same-page sign-in. */ }
  }

  url.searchParams.delete('q');
  const query = url.searchParams.toString();
  try {
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${query ? `?${query}` : ''}${url.hash}`,
    );
  } catch { /* empty-catch: intentional — the question is still queued if history cannot be rewritten. */ }
}

/** Read and clear the one-shot question after the authenticated shell hydrates. */
export function consumeMarketingQuestion(): string | null {
  let question = inMemoryQuestion;
  inMemoryQuestion = null;
  try {
    question = window.sessionStorage.getItem(PENDING_QUESTION_KEY) || question;
    window.sessionStorage.removeItem(PENDING_QUESTION_KEY);
  } catch { /* empty-catch: intentional — the in-memory copy covers unavailable session storage. */ }
  return question?.trim() || null;
}
