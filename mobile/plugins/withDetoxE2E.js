const fs = require('node:fs');
const path = require('node:path');
const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withProjectBuildGradle,
} = require('@expo/config-plugins');

/**
 * Add Detox's Android test harness only for the CI device-smoke prebuild.
 * Keeping this behind DETOX_E2E avoids putting test-only dependencies and
 * cleartext localhost rules into release Android projects.
 */
module.exports = function withDetoxE2E(config) {
  if (process.env.DETOX_E2E !== '1') return config;

  const detoxVersion = require('../package.json').devDependencies.detox.replace(/^[^0-9]*/, '');

  config = withProjectBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') return gradleConfig;

    let contents = gradleConfig.modResults.contents;
    if (!contents.includes('node_modules/detox/Detox-android')) {
      contents = contents.replace(
        /(allprojects\s*\{\s*repositories\s*\{[\s\S]*?mavenCentral\(\))/,
        '$1\n    maven { url "$rootDir/../node_modules/detox/Detox-android" }',
      );
    }

    gradleConfig.modResults.contents = contents;
    return gradleConfig;
  });

  config = withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') return gradleConfig;

    let contents = gradleConfig.modResults.contents;
    if (!contents.includes('testBuildType System.getProperty')) {
      contents = contents.replace(
        /(\s+defaultConfig\s*\{)/,
        '$1\n        testBuildType System.getProperty(\'testBuildType\', \'debug\')\n        testInstrumentationRunner \'androidx.test.runner.AndroidJUnitRunner\'',
      );
    }
    if (!contents.includes('com.wix:detox:')) {
      contents = contents.replace(
        /(\s+dependencies\s*\{)/,
        `$1\n    androidTestImplementation("com.wix:detox:${detoxVersion}")\n    implementation("androidx.appcompat:appcompat:1.7.0")`,
      );
    }

    gradleConfig.modResults.contents = contents;
    return gradleConfig;
  });

  config = withAndroidManifest(config, (manifestConfig) => {
    const application = manifestConfig.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    }
    return manifestConfig;
  });

  return withDangerousMod(config, ['android', async (dangerousConfig) => {
    const androidRoot = dangerousConfig.modRequest.platformProjectRoot;
    const testDir = path.join(androidRoot, 'app', 'src', 'androidTest', 'java', 'com', 'topodrive', 'socrates');
    const resourceDir = path.join(androidRoot, 'app', 'src', 'main', 'res', 'xml');
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(resourceDir, { recursive: true });

    fs.writeFileSync(
      path.join(testDir, 'DetoxTest.java'),
      `package com.topodrive.socrates;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.LargeTest;
import androidx.test.rule.ActivityTestRule;

import com.wix.detox.Detox;
import com.wix.detox.config.DetoxConfig;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
@LargeTest
public class DetoxTest {
    @Rule
    public ActivityTestRule<MainActivity> mActivityRule =
        new ActivityTestRule<>(MainActivity.class, false, false);

    @Test
    public void runDetoxTests() {
        DetoxConfig detoxConfig = new DetoxConfig();
        detoxConfig.idlePolicyConfig.masterTimeoutSec = 90;
        detoxConfig.idlePolicyConfig.idleResourceTimeoutSec = 60;
        detoxConfig.rnContextLoadTimeoutSec = BuildConfig.DEBUG ? 180 : 60;
        Detox.runTests(mActivityRule, detoxConfig);
    }
}
`,
      'utf8',
    );

    fs.writeFileSync(
      path.join(resourceDir, 'network_security_config.xml'),
      `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">10.0.2.2</domain>
        <domain includeSubdomains="true">localhost</domain>
    </domain-config>
</network-security-config>
`,
      'utf8',
    );

    return dangerousConfig;
  }]);
};
