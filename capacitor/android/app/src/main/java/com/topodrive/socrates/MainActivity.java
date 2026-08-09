package com.topodrive.socrates;

import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Native shell for the shared Socrates web UI.
 *
 * Android 15 makes edge-to-edge mandatory for targetSdk 35. The WebView
 * therefore draws behind the system bars and receives the measured bar
 * insets as CSS variables; the web layer can use the same safe-area model on
 * older Android versions and on devices with a cutout.
 */
public class MainActivity extends BridgeActivity {

    private WebView insetsWebView;
    private Insets latestSystemInsets;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setBackgroundDrawableResource(android.R.color.black);
        getWindow().getDecorView().setBackgroundColor(Color.BLACK);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
            getWindow(),
            getWindow().getDecorView()
        );
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
        installInsetsBridge();
    }

    @Override
    public void onResume() {
        super.onResume();
        installInsetsBridge();
        pushInsetsToWebView();
    }

    private void installInsetsBridge() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        if (insetsWebView != null) {
            pushInsetsToWebView();
            return;
        }

        insetsWebView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(insetsWebView, (View view, WindowInsetsCompat insets) -> {
            latestSystemInsets = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            pushInsetsToWebView();
            return insets;
        });
        ViewCompat.requestApplyInsets(insetsWebView);

        /* A cold-start inset callback can happen before the first document is
         * ready. Re-apply after the WebView has had a chance to load so the
         * CSS variables survive the initial navigation. */
        insetsWebView.postDelayed(this::pushInsetsToWebView, 200);
        insetsWebView.postDelayed(this::pushInsetsToWebView, 800);
    }

    private void pushInsetsToWebView() {
        if (insetsWebView == null || latestSystemInsets == null) return;

        final int statusBar = Math.max(0, latestSystemInsets.top);
        final int navigationBar = Math.max(0, latestSystemInsets.bottom);
        String script = "(function(){"
            + "var root=document.documentElement;"
            + "if(!root)return;"
            + "root.style.setProperty('--native-statusbar-inset','" + statusBar + "px');"
            + "root.style.setProperty('--native-navigationbar-inset','" + navigationBar + "px');"
            + "})();";
        insetsWebView.evaluateJavascript(script, null);
    }

    /**
     * launchMode=singleTask delivers OAuth/deep-link intents here instead of
     * creating another activity. Capacitor's App plugin consumes the updated
     * intent and emits appUrlOpen to the shared frontend.
     */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }
}
