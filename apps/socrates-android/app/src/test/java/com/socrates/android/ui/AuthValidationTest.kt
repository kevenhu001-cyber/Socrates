package com.socrates.android.ui

import org.junit.Assert.*
import org.junit.Test

class AuthValidationTest {
    @Test fun acceptsTrimmedEmailAndRejectsInvalidOrOverlongInput() {
        assertTrue(AuthValidation.validEmail(" test+tag@example.com "))
        listOf("test", "a@", "@a.com", "a b@c.com", "a@b", "a@b@c.com", "x".repeat(250) + "@example.com").forEach { assertFalse(it, AuthValidation.validEmail(it)) }
    }
    @Test fun passwordBoundsMatchServer() {
        assertFalse(AuthValidation.validPassword("a".repeat(7)))
        assertTrue(AuthValidation.validPassword("a".repeat(8)))
        assertTrue(AuthValidation.validPassword("a".repeat(64)))
        assertFalse(AuthValidation.validPassword("a".repeat(65)))
    }
    @Test fun codeIsExactlySixAsciiDigits() {
        assertTrue(AuthValidation.validCode("012345"))
        listOf("12345", "1234567", "abcdef", " 123456", "１２３４５６").forEach { assertFalse(AuthValidation.validCode(it)) }
    }
    @Test fun resetAcceptsTokenAndQueryOrFragmentLinks() {
        assertEquals("abc", AuthValidation.resetToken(" abc "))
        assertEquals("a+b", AuthValidation.resetToken("https://example.com/reset?token=a%2Bb"))
        assertEquals("xyz", AuthValidation.resetToken("https://example.com/#/reset?token=xyz"))
        assertEquals("xyz", AuthValidation.resetToken("https://example.com/#token=xyz&next=home"))
    }
    @Test fun resetRejectsLinksWithoutTokenAndMalformedInput() {
        assertEquals("", AuthValidation.resetToken("https://example.com/reset"))
        assertEquals("", AuthValidation.resetToken("https://bad space/?token=a"))
        assertEquals("", AuthValidation.resetToken(""))
    }
}
