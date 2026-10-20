package com.socrates.android
import org.junit.Assert.assertEquals
import org.junit.Test
class ProjectConfigurationTest { @Test fun appIdIsExpected() { assertEquals("com.socrates.android", BuildConfig.APPLICATION_ID) } }
