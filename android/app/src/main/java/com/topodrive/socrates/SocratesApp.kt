package com.topodrive.socrates

import android.app.Application
import com.topodrive.socrates.data.Api
import com.topodrive.socrates.data.Prefs

class SocratesApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Api.prefs = Prefs(this)
    }
}
