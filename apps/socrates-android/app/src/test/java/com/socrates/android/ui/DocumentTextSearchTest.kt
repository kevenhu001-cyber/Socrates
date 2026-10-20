package com.socrates.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Locale

class DocumentTextSearchTest {
    @Test fun emptyQueryAndWhitespaceQuery() {
        assertEquals(emptyList<DocumentTextMatch>(), DocumentTextSearch.find("abc", "").matches)
        assertEquals(listOf(DocumentTextMatch(1, 3)), DocumentTextSearch.find("a  b", "  ").matches)
    }

    @Test fun chineseAndCaseInsensitiveIndependentOfDefaultLocale() {
        val original = Locale.getDefault()
        try {
            Locale.setDefault(Locale.forLanguageTag("tr-TR"))
            assertEquals(listOf(DocumentTextMatch(0, 3)), DocumentTextSearch.find("i中I", "I中i").matches)
            assertEquals(listOf(DocumentTextMatch(0, 1)), DocumentTextSearch.find("i", "I").matches)
        } finally {
            Locale.setDefault(original)
        }
    }

    @Test fun emojiMatchesWholeAndIsolatedSurrogatesDoNotMatchInsideEmoji() {
        val emoji = "\uD83D\uDE00"
        assertEquals(listOf(DocumentTextMatch(1, 3)), DocumentTextSearch.find("a${emoji}b", emoji).matches)
        assertTrue(DocumentTextSearch.find(emoji, "\uD83D").matches.isEmpty())
        assertTrue(DocumentTextSearch.find(emoji, "\uDE00").matches.isEmpty())
        assertEquals(listOf(DocumentTextMatch(0, 1)), DocumentTextSearch.find("\uD83D", "\uD83D").matches)
    }

    @Test fun matchesAreNonOverlappingAndQueryIsLiteral() {
        assertEquals(listOf(DocumentTextMatch(0, 2)), DocumentTextSearch.find("aaa", "aa").matches)
        assertEquals(listOf(DocumentTextMatch(0, 2), DocumentTextMatch(2, 4)), DocumentTextSearch.find("aaaa", "aa").matches)
        assertFalse(DocumentTextSearch.find("aaa", "aa", 1).hasMore)
        assertTrue(DocumentTextSearch.find("aaaa", "aa", 1).hasMore)
        assertEquals(listOf(DocumentTextMatch(1, 3)), DocumentTextSearch.find("x.*y", ".*").matches)
    }

    @Test fun matchesAcrossSixThousandCharacterSegmentsKeepGlobalOffsets() {
        val text = "x".repeat(5999) + "needle" + "z".repeat(5)
        assertEquals(listOf(DocumentTextMatch(5999, 6005)), DocumentTextSearch.find(text, "needle").matches)
        assertEquals(0, DocumentTextSearch.segmentIndex(listOf("a".repeat(6000), "b"), 5999))
        assertEquals(1, DocumentTextSearch.segmentIndex(listOf("a".repeat(6000), "b"), 6000))
        assertEquals(0..2, DocumentTextSearch.localRanges(DocumentTextMatch(5999, 6005), 6001, 3))
        assertNull(DocumentTextSearch.localRanges(DocumentTextMatch(0, 1), 1, 2))
    }

    @Test fun capRetainsAtMostMaximumAndDetectsOneMoreMatch() {
        val result = DocumentTextSearch.find("x".repeat(1002), "x", maxMatches = 1000)
        assertEquals(1000, result.matches.size)
        assertEquals(DocumentTextMatch(999, 1000), result.matches.last())
        assertTrue(result.hasMore)
        assertFalse(DocumentTextSearch.find("xx", "x", maxMatches = 2).hasMore)
    }

    @Test fun rejectsExcessiveQueryInvalidCapsAndInvalidOffsets() {
        assertThrows(IllegalArgumentException::class.java) { DocumentTextSearch.find("x", "a".repeat(201)) }
        assertThrows(IllegalArgumentException::class.java) { DocumentTextSearch.find("x", "x", 0) }
        assertThrows(IllegalArgumentException::class.java) { DocumentTextSearch.find("x", "x", 1001) }
        assertThrows(IllegalArgumentException::class.java) { DocumentTextSearch.segmentIndex(emptyList(), 1) }
        assertEquals(0, DocumentTextSearch.segmentIndex(emptyList(), 0))
        assertThrows(IllegalArgumentException::class.java) { DocumentTextSearch.segmentIndex(listOf("ab"), -1) }
        assertThrows(IllegalArgumentException::class.java) { DocumentTextSearch.segmentIndex(listOf("ab"), 2) }
        assertThrows(IllegalArgumentException::class.java) { DocumentTextSearch.localRanges(DocumentTextMatch(-1, 1), 0, 2) }
    }
}
