/* ui/homeSurface.js — LobeHub-style landing shortcuts.
 * The home surface is plain markup inside #topicSetup; this module only owns
 * its click affordances so the visual layer stays declarative. */

export function installHomeSurface() {
  document.addEventListener('click', (event) => {
    const navTarget = event.target.closest?.('[data-home-nav]');
    if (navTarget) {
      event.preventDefault();
      const destination = navTarget.dataset.homeNav;
      if (!destination) return;
      if (typeof window.openNav === 'function') window.openNav(destination);
      else if (typeof window[`open${destination[0].toUpperCase()}${destination.slice(1)}`] === 'function') {
        window[`open${destination[0].toUpperCase()}${destination.slice(1)}`]();
      }
      return;
    }

    const actionTarget = event.target.closest?.('[data-home-action]');
    if (!actionTarget) return;
    event.preventDefault();
    const action = actionTarget.dataset.homeAction;
    const delegates = {
      write: 'composeAction',
      research: 'researchAction',
    };
    if (action === 'upload') {
      /* Keep the entry point on the real composer tools control so the
         existing upload flow and the OpenConnector menu stay in one place. */
      const toolsButton = document.getElementById('topicComposerToolsBtn');
      if (toolsButton) {
        toolsButton.click();
      } else {
        document.getElementById('topicAttachInput')?.click();
      }
      return;
    }
    const delegate = delegates[action];
    if (delegate && typeof window[delegate] === 'function') {
      window[delegate]();
    }
  });
}
