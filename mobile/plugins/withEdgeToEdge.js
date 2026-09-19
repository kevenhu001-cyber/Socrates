const { AndroidConfig, withMainActivity, withAndroidStyles } = require('@expo/config-plugins');

const { setStylesItem, getAppThemeGroup } = AndroidConfig.Styles;

/**
 * Android 16 makes edge-to-edge mandatory and Expo SDK 57 dropped the
 * `android.edgeToEdgeEnabled` app.json key, but devices on Android 10–14 still
 * lay the window out below an opaque status bar. Re-apply the two native
 * settings that make the surface reach the top of the display on every OS
 * version, so `expo prebuild --clean` (local and CI) produces the same result.
 */
const WINDOW_ITEMS = [
  { name: 'android:windowDrawsSystemBarBackgrounds', value: 'true' },
  { name: 'android:enforceStatusBarContrast', value: 'false', tools: true },
  { name: 'android:enforceNavigationBarContrast', value: 'false', tools: true },
];

const TRANSPARENT_BAR_ITEMS = [
  { name: 'android:statusBarColor', value: '@android:color/transparent' },
  { name: 'android:navigationBarColor', value: '@android:color/transparent' },
];

const IMPORT_SNIPPET = 'import androidx.core.view.WindowCompat';
const CALL_SNIPPET = '    WindowCompat.setDecorFitsSystemWindows(window, false)';

module.exports = function withEdgeToEdge(config) {
  config = withAndroidStyles(config, (cfg) => {
    const parent = getAppThemeGroup();
    let xml = cfg.modResults;
    for (const { name, value, tools } of [...TRANSPARENT_BAR_ITEMS, ...WINDOW_ITEMS]) {
      const item = { $: { name } };
      if (tools) item.$['tools:targetApi'] = '29';
      item._ = value;
      xml = setStylesItem({ item, xml, parent });
    }
    cfg.modResults = xml;
    return cfg;
  });

  return withMainActivity(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes('androidx.core.view.WindowCompat')) {
      contents = contents.replace(/^import /m, `${IMPORT_SNIPPET}\nimport `);
    }
    if (!contents.includes('setDecorFitsSystemWindows')) {
      contents = contents.replace(
        /^(\s*)super\.onCreate\(null\)/m,
        `$1// Applied by the withEdgeToEdge config plugin (mobile/plugins/withEdgeToEdge.js).\n$1${CALL_SNIPPET.trim()}\n$1super.onCreate(null)`,
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });
};
