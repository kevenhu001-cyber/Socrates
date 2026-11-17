export function enableTestState(pageOrContext) {
  return pageOrContext.addInitScript(() => {
    window.__installSocratesTestState = (state) => {
      delete window.__installSocratesTestState;
      window.__socratesTestState = state;
    };
  });
}
