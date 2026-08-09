module.exports = {
  testRunner: { args: { config: 'e2e/jest.config.js' }, jest: { setupTimeout: 120000 } },
  apps: {
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd android && gradlew.bat assembleDebug assembleAndroidTest -DtestBuildType=debug',
    },
  },
  devices: { emulator: { type: 'android.emulator', device: { avdName: 'Pixel_6_API_35' } } },
  configurations: { 'android.debug': { device: 'emulator', app: 'android.debug' } },
};
