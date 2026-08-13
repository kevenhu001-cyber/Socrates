export async function getNetworkStatus() {
  return true;
}

export function subscribeToNetworkStatus(_onChange: (online: boolean) => void) {
  return () => undefined;
}
