import * as Network from 'expo-network';

export async function getNetworkStatus() {
  const state = await Network.getNetworkStateAsync();
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

export function subscribeToNetworkStatus(onChange: (online: boolean) => void) {
  const subscription = Network.addNetworkStateListener((state) => {
    onChange(Boolean(state.isConnected && state.isInternetReachable !== false));
  });
  return () => subscription.remove();
}
