package com.socrates.android.bridge

import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.lang.reflect.Modifier

class SocratesNativeBridgeTest {

    @Test
    fun bridgeExposesJavascriptInterfaceMethods() {
        val clazz = SocratesNativeBridge::class.java
        assertNotNull(clazz)

        val methods = clazz.declaredMethods
        val jsMethods = methods.filter { method ->
            method.isAnnotationPresent(android.webkit.JavascriptInterface::class.java)
        }.map { it.name }

        assertTrue("performHaptic must be annotated with @JavascriptInterface", jsMethods.contains("performHaptic"))
        assertTrue("notifyPageReady must be annotated with @JavascriptInterface", jsMethods.contains("notifyPageReady"))
        assertTrue("postMessage must be annotated with @JavascriptInterface", jsMethods.contains("postMessage"))
    }

    @Test
    fun bridgeHasDispatchHelpers() {
        val clazz = SocratesNativeBridge::class.java
        val methodNames = clazz.declaredMethods.map { it.name }

        assertTrue("dispatchKeyboardHeight must exist", methodNames.contains("dispatchKeyboardHeight"))
        assertTrue("dispatchSystemInsets must exist", methodNames.contains("dispatchSystemInsets"))
        assertTrue("dispatchBackPress must exist", methodNames.contains("dispatchBackPress"))
    }
}
