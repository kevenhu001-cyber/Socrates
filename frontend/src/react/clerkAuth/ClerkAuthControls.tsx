/* Clerk auth controls — React island. Mounted by the host that owns
 * its target element. Used by the marketing-site integration (the
 * SPA shell does not render auth controls in the top-bar; auth lives
 * on the marketing site per product flow).
 *
 * Wraps in <ClerkProvider> so Clerk hooks work. The publishable key
 * comes from VITE_CLERK_PUBLISHABLE_KEY. The redirect URL is the
 * post-sign-in destination — defaults to the SPA's landing/topic
 * input page so the marketing site can re-use this widget. */

/// <reference types="vite/client" />

import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from '@clerk/react';
import { createRoot } from 'react-dom/client';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
/* After sign-in, send users to the SPA's topic-input landing. The host
 * (marketing-site integration) can override via the
 * data-redirect-url attribute on the host element. */
const DEFAULT_REDIRECT_URL = (typeof window !== 'undefined' && window.location?.origin)
  ? `${window.location.origin}/`
  : '/';

export interface ClerkAuthControlsOptions {
  redirectUrl?: string;
}

export function hydrateClerkAuthControls(options: ClerkAuthControlsOptions = {}): boolean {
  const host = document.getElementById('clerkAuthRoot');
  if (!host) return false;
  if (!PUBLISHABLE_KEY) {
    host.textContent = '';
    return false;
  }
  const forceRedirectUrl = options.redirectUrl
    ?? host.getAttribute('data-redirect-url')
    ?? DEFAULT_REDIRECT_URL;
  createRoot(host).render(
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <ClerkAuthControls forceRedirectUrl={forceRedirectUrl} />
    </ClerkProvider>,
  );
  return true;
}

interface ClerkAuthControlsProps {
  forceRedirectUrl: string;
}

function ClerkAuthControls({ forceRedirectUrl }: ClerkAuthControlsProps) {
  return (
    <div className="clerk-auth-controls">
      <Show when="signed-out">
        <SignInButton mode="modal" forceRedirectUrl={forceRedirectUrl}>
          <button type="button" className="top-bar-btn clerk-signin" aria-label="Sign in">Sign in</button>
        </SignInButton>
        <SignUpButton mode="modal" forceRedirectUrl={forceRedirectUrl}>
          <button type="button" className="top-bar-btn clerk-signup" aria-label="Sign up">Sign up</button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </div>
  );
}
