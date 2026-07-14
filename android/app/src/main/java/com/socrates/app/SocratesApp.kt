package com.socrates.app

import android.app.Application
import com.socrates.app.data.AppContainer
import com.socrates.app.data.DefaultAppContainer

/**
 * Process-wide entry point. We deliberately avoid a DI framework — the
 * project is small enough that a hand-rolled [AppContainer] keeps the
 * surface area legible and the build graph simple.
 */
class SocratesApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = DefaultAppContainer(this)
    }
}
