import * as Network from 'expo-network';

export async function getNetworkStatus(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return Boolean(state.isConnected && state.isInternetReachable !== false);
  } catch (error) {
    console.warn('[Network] Failed to read network state, defaulting to online:', error);
    // Safe default: do not prematurely lock user out of network requests
    return true;
  }
}

export function subscribeToNetworkStatus(onChange: (online: boolean) => void) {
  try {
    const subscription = Network.addNetworkStateListener((state) => {
      onChange(Boolean(state.isConnected && state.isInternetReachable !== false));
    });
    return () => subscription.remove();
  } catch (error) {
    console.warn('[Network] Failed to attach network state listener:', error);
    return () => {};
  }
}
