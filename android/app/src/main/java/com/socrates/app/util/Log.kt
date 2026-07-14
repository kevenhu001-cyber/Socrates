package com.socrates.app.util

import android.util.Log as AndroidLog

/**
 * Thin wrapper so we can replace logging later (e.g. Timber) without
 * touching call sites. The default level is `INFO` in release and
 * `DEBUG` for debug builds.
 */
object Log {
    private const val DEFAULT_TAG = "Socrates"

    fun d(tag: String, msg: String) {
        if (com.socrates.app.BuildConfig.DEBUG) AndroidLog.d(tag, msg)
    }

    fun i(tag: String, msg: String) {
        AndroidLog.i(tag, msg)
    }

    fun w(tag: String, msg: String, t: Throwable? = null) {
        AndroidLog.w(tag, msg, t)
    }

    fun e(tag: String, msg: String, t: Throwable? = null) {
        AndroidLog.e(tag, msg, t)
    }

    fun d(msg: String) = d(DEFAULT_TAG, msg)
    fun i(msg: String) = i(DEFAULT_TAG, msg)
    fun w(msg: String, t: Throwable? = null) = w(DEFAULT_TAG, msg, t)
    fun e(msg: String, t: Throwable? = null) = e(DEFAULT_TAG, msg, t)
}
