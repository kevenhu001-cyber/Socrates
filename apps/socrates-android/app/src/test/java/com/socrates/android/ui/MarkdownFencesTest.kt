package com.socrates.android.ui

import org.commonmark.node.FencedCodeBlock
import org.commonmark.parser.Parser
import org.junit.Assert.*
import org.junit.Test

class MarkdownFencesTest {
    private fun s(value: String) = value.replace('§', '$')
    private fun code(source: String) = MarkdownFences.parts(s(source)).single { it.language != null }

    @Test fun splitsOnlyActualLineFences() {
        val parts = MarkdownFences.parts("before\n```kt\nval n = 1\n```\nafter")
        assertEquals(listOf("before\n", "val n = 1\n", "after"), parts.map { it.source })
        assertEquals(listOf(null, "kt", null), parts.map { it.language })
    }

    @Test fun longerOpeningKeepsShorterFenceAndMathLiteral() {
        assertEquals(s("```\n§x§\n\\[a_i\n"), code("````tex\n```\n§x§\n\\[a_i\n````").source)
    }

    @Test fun longerCloserIsAccepted() {
        assertEquals("value\n", code("~~~txt\nvalue\n~~~~~").source)
    }

    @Test fun closingFenceMayHaveOnlySpacesAndTabsAfterIt() {
        assertEquals("value\n", code("```\nvalue\n   ``` \t").source)
    }

    @Test fun fourSpaceClosingFenceIsCodeNotAnEarlyClose() {
        val source = "```tex\n    ```\n§x§\n```\n\\(y\\)"
        val parts = MarkdownFences.parts(s(source))
        assertEquals(s("    ```\n§x§\n"), parts.first().source)
        assertEquals(s("§§y§§"), MarkdownSource.normalize(parts.last().source))
    }

    @Test fun tabIndentedClosingFenceIsNotAnEarlyClose() {
        assertEquals("\t```\nvalue\n", code("```\n\t```\nvalue\n```").source)
    }

    @Test fun closingWithTextIsLiteralCode() {
        assertEquals("```no\nvalue\n", code("```\n```no\nvalue\n```").source)
    }

    @Test fun wrongFenceCharacterCannotClose() {
        assertEquals("```\nvalue\n", code("~~~\n```\nvalue\n~~~").source)
    }

    @Test fun fourSpaceOrTabIndentedOpenersAreNotCustomCodePanels() {
        listOf("    ```", "\t```", " \t~~~").forEach { opener ->
            assertTrue(MarkdownFences.parts("$opener\nvalue").all { it.language == null })
        }
    }

    @Test fun backtickInInfoInvalidatesOpening() {
        assertTrue(MarkdownFences.parts("```a`b\nvalue").all { it.language == null })
    }

    @Test fun tildeInfoCanContainBackticks() {
        assertEquals("a`b", code("~~~a`b\nvalue\n~~~").language)
    }

    @Test fun fewerThanThreeMarkersAreNotFences() {
        listOf("``", "~~").forEach { assertNull(MarkdownFences.opening(it)) }
    }

    @Test fun inlineMarkersAreNotFences() {
        assertTrue(MarkdownFences.parts("prose ~~~ §x§ ~~~").all { it.language == null })
    }

    @Test fun openingIndentIsRemovedFromContentOnlyUpToThatWidth() {
        assertEquals("one\n two\nzero\n", code("  ```\n  one\n   two\nzero\n  ```").source)
    }

    @Test fun deindentRemovesSpacesButNeverExpandsLiteralTabs() {
        assertEquals("\tvalue\n\tsecond\n", code("  ```\n\tvalue\n \tsecond\n```").source)
    }

    @Test fun trailingBlankLinesAndSpacesAreNotTrimmed() {
        assertEquals("value  \n\n\n", code("```\nvalue  \n\n\n```").source)
    }

    @Test fun lineEndingsArePreservedForCopy() {
        listOf("\n", "\r\n", "\r").forEach { eol ->
            assertEquals("a${eol}${eol}", code("```txt${eol}a${eol}${eol}```$eol").source)
        }
    }

    @Test fun unclosedCodeDoesNotFabricateFinalNewline() {
        assertEquals(s("§x§"), code("```tex\n§x§").source)
        assertEquals(s("§x§\n\n"), code("```tex\n§x§\n\n").source)
    }

    @Test fun emptyCodePanelIsNotDropped() {
        assertEquals("", code("```\n```").source)
        assertEquals("", code("```kt").source)
    }

    @Test fun proseWhitespaceAndUnicodeRemainUnchanged() {
        val parts = MarkdownFences.parts("正文🙂  \r\n\r\n```txt\r\n代码🙂\r\n```\r\n尾部  ")
        assertEquals("正文🙂  \r\n\r\n", parts.first().source)
        assertEquals("代码🙂\r\n", parts[1].source)
        assertEquals("尾部  ", parts.last().source)
    }

    @Test fun whitespaceOnlyProseAroundPanelsIsRetainedInTheModel() {
        val parts = MarkdownFences.parts("  \n```\nx\n```\n \t\n")
        assertEquals(listOf("  \n", "x\n", " \t\n"), parts.map { it.source })
        assertEquals(listOf(MarkdownFences.Part(" \t\r\n")), MarkdownFences.parts(" \t\r\n"))
        assertTrue(MarkdownFences.parts("").isEmpty())
    }

    @Test fun pendingMathOnlyComesFromFollowingProseNotFromCode() {
        val parts = MarkdownFences.parts("```tex\n\\[x_i\n```\n尾部 \\(y_i")
        assertEquals("\\[x_i\n", parts.first().source)
        assertEquals("\\(y_i", MarkdownSource.preview(parts.last().source, true).pendingMath)
    }

    @Test fun normalizationAndPanelBoundariesAgreeForEveryFenceVariant() {
        for (marker in listOf('`', '~')) for (length in 3..6) for (indent in 0..3) {
            val fence = marker.toString().repeat(length)
            val source = " ".repeat(indent) + fence + "tex\n\\[x_i\n" + " ".repeat(indent) + fence + "\n"
            assertEquals(source, MarkdownSource.normalize(source))
            assertNull(MarkdownSource.preview(source, true).pendingMath)
            assertEquals("\\[x_i\n", code(source).source)
        }
    }

    @Test fun topLevelFenceContentAgreesWithExistingCommonMarkParser() {
        val parser = Parser.builder().build()
        for (marker in listOf('`', '~')) for (indent in 0..3) {
            val fence = marker.toString().repeat(4)
            val source = " ".repeat(indent) + fence + "text\n\tvalue\n\n" + marker.toString().repeat(3) + "\n" + fence
            val parsed = parser.parse(source).firstChild as FencedCodeBlock
            val part = code(source)
            assertEquals(parsed.literal, part.source)
            assertEquals(parsed.info, part.language)
        }
    }

    @Test fun bareCrFencesProtectMathDuringNormalization() {
        val source = s("~~~tex\r§x§\r~~~\r\\(y\\)")
        assertEquals(s("~~~tex\r§x§\r~~~\r§§y§§"), MarkdownSource.normalize(source))
    }

    @Test fun multiplePanelsDoNotSwallowInterveningMath() {
        val parts = MarkdownFences.parts(s("```a\n§x§\n```\n\\(y\\)\n~~~b\n\\[z\n~~~"))
        assertEquals(3, parts.size)
        assertEquals(s("§x§\n"), parts[0].source)
        assertEquals(s("§§y§§\n"), MarkdownSource.normalize(parts[1].source))
        assertEquals("\\[z\n", parts[2].source)
    }
}
