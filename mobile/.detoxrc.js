const gradleCommand = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const avdName = process.env.DETOX_AVD_NAME || 'Pixel_6_API_35';

module.exports = {
  testRunner: { args: { config: 'e2e/jest.config.js' }, jest: { setupTimeout: 120000 } },
  apps: {
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: `cd android && ${gradleCommand} assembleDebug assembleAndroidTest -DtestBuildType=debug`,
    },
  },
  devices: { emulator: { type: 'android.emulator', device: { avdName } } },
  configurations: { 'android.debug': { device: 'emulator', app: 'android.debug' } },
};
