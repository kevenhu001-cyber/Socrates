package com.topodrive.socrates;

import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * Entry point for the Socrates Capacitor shell.
 *
 * Most plugin wiring is configured declaratively via
 * {@code capacitor.config.json} (StatusBar, Keyboard, App). This class
 * only handles the things that have to happen in code:
 *
 *  - Paint the window background to the app's dark surface before the
 *    WebView is laid out, so the first frame after the splash dismisses
 *    matches the in-app theme and does not flash white.
 *  - Forward a couple of safe-by-default overrides for the edge cases
 *    that JSON config can't express (e.g. StatusBar background colour
 *    after the system theme changes).
 */
public class MainActivity extends BridgeActivity {

    /** Default surface colour — must match the in-app dark theme. */
    private static final int DARK_SURFACE = Color.parseColor("#101318");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        /* Set the window background early. The theme XML already paints
           the splash, but the WebView's own surface picks up the window
           background once the splash is removed. Without this, the user
           sees a black-to-white flash on cold start. */
        getWindow().setBackgroundDrawableResource(android.R.color.transparent);
        getWindow().getDecorView().setBackgroundColor(DARK_SURFACE);
    }

    /**
     * Forward new intents (deep links, OAuth callbacks) to the Capacitor
     * bridge so the App plugin emits an appUrlOpen event to the web layer.
     * Required because launchMode="singleTask" means the existing activity
     * receives the intent via onNewIntent instead of onCreate.
     */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }
}
