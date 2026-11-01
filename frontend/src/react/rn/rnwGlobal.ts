/**
 * react-native-web's vendored Animated (TimingAnimation / SpringAnimation /
 * DecayAnimation `stop()`) calls `global.cancelAnimationFrame`. Vite does not
 * define the Node `global` alias, so the first animation that stopped (e.g. a
 * home hero fade unmounting when the chat view opens) threw
 * `ReferenceError: global is not defined` and raised the red global error
 * banner. Import this module (for its side effect) before any RN surface
 * renders; WebUiTheme does (every RN mount goes through it), and the home
 * mount entry (HomeStartComponents) imports it first as well.
 */
const scope = globalThis as typeof globalThis & { global?: typeof globalThis };
if (!scope.global) scope.global = globalThis;

export {};
