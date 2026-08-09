const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Keep production signing reproducible without checking a keystore or a
 * generated Android project into source control. Local release builds retain
 * Expo's debug signing fallback; CI requires all four environment variables.
 */
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') return gradleConfig;

    let contents = gradleConfig.modResults.contents;
    if (!contents.includes('ANDROID_KEYSTORE_PATH')) {
      contents = contents.replace(
        /\n    buildTypes \{/,
        `
    signingConfigs {
        socratesRelease {
            def releaseStorePath = System.getenv("ANDROID_KEYSTORE_PATH")
            if (releaseStorePath) {
                storeFile file(releaseStorePath)
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }
    buildTypes {`,
      );
    }

    contents = contents.replace(
      /release \{([\s\S]*?)signingConfig signingConfigs\.debug/,
      'release {$1signingConfig System.getenv("ANDROID_KEYSTORE_PATH") ? signingConfigs.socratesRelease : signingConfigs.debug',
    );

    gradleConfig.modResults.contents = contents;
    return gradleConfig;
  });
};
