/* ui/homeSurface.js — LobeHub-style landing shortcuts.
 * The home surface is plain markup inside #topicSetup; this module only owns
 * its click affordances so the visual layer stays declarative. */

export function installHomeSurface() {
  document.addEventListener('click', (event) => {
    const navTarget = event.target.closest?.('[data-home-nav]');
    if (!navTarget) return;
    event.preventDefault();
    const destination = navTarget.dataset.homeNav;
    if (!destination) return;
    if (typeof window.openNav === 'function') window.openNav(destination);
    else if (typeof window[`open${destination[0].toUpperCase()}${destination.slice(1)}`] === 'function') {
      window[`open${destination[0].toUpperCase()}${destination.slice(1)}`]();
    }
  });
}
