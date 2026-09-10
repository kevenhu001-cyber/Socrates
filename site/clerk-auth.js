/* Clerk auth widget — vanilla @clerk/clerk-js integration for the
 * marketing site. Auth lives on the marketing site per the product
 * flow; the SPA shell only consumes the session cookie that Clerk
 * sets after sign-in.
 *
 * Required data attributes on the script tag (or on <html>):
 *   data-publishable-key  — Clerk pk_test_… key (non-secret)
 *   data-app-url          — full URL of the SPA's topic-input page
 *
 * Reads:
 *   data-app-url (default: same-origin + "/")
 *
 * Renders Sign in / Sign up buttons in the matching DOM container; if
 * the visitor is already signed in, shows a "Open Socrates" button
 * pointing at data-app-url and a "Sign out" action. */

(function () {
  var script = document.currentScript || document.querySelector('script[data-clerk-auth]');
  if (!script) return;
  var pk = script.getAttribute('data-publishable-key');
  if (!pk) {
    console.warn('[clerk-auth] missing data-publishable-key — auth widget disabled');
    return;
  }
  /* Resolve the SPA URL. Fall back to the dev server port used by Vite
   * when running on localhost; production uses the marketing site's
   * configured app.topodrive.top via data-app-url. */
  var defaultAppUrl = (function () {
    var loc = window.location;
    if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
      // Vite dev moves to the next free port when 5173 is occupied
      // (the static site server binds 5173 first); 5174 is the typical
      // choice but we don't know for sure. Use 5174 as a reasonable
      // default and let the page override via data-app-url.
      return loc.protocol + '//' + loc.hostname + ':5174/';
    }
    return loc.origin + '/';
  })();
  var appUrl = script.getAttribute('data-app-url') || defaultAppUrl;

  function ready(fn) {
    if (window.Clerk) return fn(window.Clerk);
    window.addEventListener('load', function () {
      var tries = 0;
      (function poll() {
        if (window.Clerk) return fn(window.Clerk);
        if (++tries > 50) return console.warn('[clerk-auth] Clerk script did not load');
        setTimeout(poll, 100);
      })();
    });
  }

  function mount(authContainer, userContainer) {
    ready(function (Clerk) {
      Clerk.load({
        publishableKey: pk,
        // After a successful sign-in/up we redirect the browser to the
        // SPA's topic-input landing. Clerk preserves the session cookie
        // across origins because the publishable key targets the same
        // Clerk app instance as the SPA.
        signInForceRedirectUrl: appUrl,
        signUpForceRedirectUrl: appUrl,
      }).then(function () {
        render(Clerk, authContainer, userContainer);
        Clerk.addEventListener ? Clerk.addEventListener('user', function () {
          render(Clerk, authContainer, userContainer);
        }) : null;
      }).catch(function (err) {
        console.error('[clerk-auth] Clerk.load failed', err);
      });
    });
  }

  function render(Clerk, authContainer, userContainer) {
    if (!authContainer) return;
    authContainer.innerHTML = '';
    if (Clerk.user) {
      authContainer.style.display = 'none';
      if (userContainer) {
        userContainer.style.display = '';
        var openBtn = userContainer.querySelector('[data-clerk-open-app]');
        var signOutBtn = userContainer.querySelector('[data-clerk-signout]');
        if (openBtn) openBtn.href = appUrl;
        if (signOutBtn) {
          signOutBtn.onclick = function () {
            Clerk.signOut().then(function () { window.location.reload(); });
            return false;
          };
        }
      }
      return;
    }
    authContainer.style.display = '';
    if (userContainer) userContainer.style.display = 'none';
    authContainer.appendChild(button('Sign in', function () {
      Clerk.openSignIn({ forceRedirectUrl: appUrl });
    }, 'clerk-btn clerk-btn-ghost'));
    authContainer.appendChild(button('Sign up', function () {
      Clerk.openSignUp({ forceRedirectUrl: appUrl });
    }, 'clerk-btn clerk-btn-primary'));
  }

  function button(label, onClick, className) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function boot() {
    var authContainer = document.querySelector('[data-clerk-auth-root]');
    var userContainer = document.querySelector('[data-clerk-user-root]');
    if (!authContainer && !userContainer) return;
    mount(authContainer, userContainer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
