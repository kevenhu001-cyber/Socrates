package com.socrates.android.ui

import org.junit.Assert.*
import org.junit.Test

class ToolOutputSyntaxTest {
    private fun preview(text: String, kind: ToolOutputKind, language: String? = null, truncated: Boolean = false) =
        ToolOutputPreview(text, kind, language, truncated)
    private fun roles(p: ToolOutputPreview) = ToolOutputSyntax.tokens(p).map { it.role }

    @Test fun jsonTokensPropertiesStringsNumbersAndLiterals() {
        val p = preview("{\"name\":\"Ada\",\"ok\":true,\"n\":-1.2e+3,\"nothing\":null}", ToolOutputKind.JSON)
        assertEquals(listOf(ToolSyntaxRole.PROPERTY, ToolSyntaxRole.STRING, ToolSyntaxRole.PROPERTY, ToolSyntaxRole.LITERAL, ToolSyntaxRole.PROPERTY, ToolSyntaxRole.NUMBER, ToolSyntaxRole.PROPERTY, ToolSyntaxRole.LITERAL), roles(p))
    }
    @Test fun jsonRequiresCompleteJsonKind() {
        assertFalse(ToolOutputSyntax.supports(preview("{}", ToolOutputKind.PLAIN)))
        assertTrue(ToolOutputSyntax.supports(preview("{}", ToolOutputKind.JSON)))
        assertEquals(emptyList<ToolSyntaxToken>(), ToolOutputSyntax.tokens(preview("x", ToolOutputKind.PLAIN)))
    }
    @Test fun supportedAliasesIgnoreCase() {
        listOf("JSON", "Python", "PY", "JavaScript", "JS", "TypeScript", "TS").forEach {
            assertTrue(it, ToolOutputSyntax.supports(preview("let x = 1", ToolOutputKind.CODE, it)))
        }
    }
    @Test fun unknownAndMissingLanguagesArePlain() {
        listOf(null, "", "kotlin", "jsx", "py3").forEach {
            assertFalse(ToolOutputSyntax.supports(preview("def f(): pass", ToolOutputKind.CODE, it)))
        }
    }
    @Test fun truncatedAndTooLongAreRejected() {
        assertFalse(ToolOutputSyntax.supports(preview("let x=1", ToolOutputKind.CODE, "js", true)))
        assertFalse(ToolOutputSyntax.supports(preview(" ".repeat(6001), ToolOutputKind.CODE, "js")))
    }
    @Test fun pythonCommentsTakePrecedenceOverWords() {
        val t = ToolOutputSyntax.tokens(preview("# return 12\nreturn 3", ToolOutputKind.CODE, "python"))
        assertEquals(ToolSyntaxRole.COMMENT, t[0].role)
        assertEquals("return", "# return 12\nreturn 3".substring(t[1].start, t[1].end))
        assertEquals(ToolSyntaxRole.KEYWORD, t[1].role)
    }
    @Test fun pythonSingleDoubleAndTripleStringsWithEscapes() {
        val s = "'a\\'b' \"c\" '''long\\ntext'''"
        val t = ToolOutputSyntax.tokens(preview(s, ToolOutputKind.CODE, "py"))
        assertEquals(3, t.size); assertTrue(t.all { it.role == ToolSyntaxRole.STRING })
        assertEquals(listOf("'a\\'b'", "\"c\"", "'''long\\ntext'''"), t.map { s.substring(it.start, it.end) })
    }
    @Test fun pythonKeywordsNumbersAndLiterals() {
        assertEquals(listOf(ToolSyntaxRole.KEYWORD, ToolSyntaxRole.NUMBER, ToolSyntaxRole.LITERAL, ToolSyntaxRole.LITERAL), roles(preview("return 0xFF True None", ToolOutputKind.CODE, "python")))
    }
    @Test fun javascriptCommentsStringsAndTemplateAreAtomic() {
        val s = "// const x\n/* let 4 */ 'a\\'b' `x ${'$'}{let}`"
        val t = ToolOutputSyntax.tokens(preview(s, ToolOutputKind.CODE, "js"))
        assertEquals(listOf(ToolSyntaxRole.COMMENT, ToolSyntaxRole.COMMENT, ToolSyntaxRole.STRING, ToolSyntaxRole.STRING), t.map { it.role })
        assertEquals("`x ${'$'}{let}`", s.substring(t.last().start, t.last().end))
    }
    @Test fun javascriptKeywordDoesNotColorInsideCommentOrString() {
        val s = "const x = 'return'; // let"
        assertEquals(listOf(ToolSyntaxRole.KEYWORD, ToolSyntaxRole.STRING, ToolSyntaxRole.COMMENT), roles(preview(s, ToolOutputKind.CODE, "javascript")))
    }
    @Test fun javascriptBlockCommentConsumesUntilTerminator() {
        val s = "/* const 10 */ let"
        val t = ToolOutputSyntax.tokens(preview(s, ToolOutputKind.CODE, "ts"))
        assertEquals(listOf(ToolSyntaxRole.COMMENT, ToolSyntaxRole.KEYWORD), t.map { it.role })
    }
    @Test fun unicodeOffsetsAreUtf16AndTokensStayValid() {
        val s = "😀 const café = 7"
        val t = ToolOutputSyntax.tokens(preview(s, ToolOutputKind.CODE, "js"))
        assertEquals(3, t.first().start)
        assertValid(s, t)
    }
    @Test fun outputIntervalsAreOrderedDisjointAndWithinSource() {
        val s = "{\"x\": [1, true, \"z\"]}"
        assertValid(s, ToolOutputSyntax.tokens(preview(s, ToolOutputKind.JSON)))
    }
    @Test fun numberBoundaryDoesNotEatIdentifier() {
        val s = "12abc"
        val t = ToolOutputSyntax.tokens(preview(s, ToolOutputKind.CODE, "js"))
        assertEquals(listOf("12"), t.map { s.substring(it.start, it.end) })
    }
    @Test fun jsonNumbersUseConservativeLexicalBoundaries() {
        val t = ToolOutputSyntax.tokens(preview("-01 1. 2e+ 4.5e-2", ToolOutputKind.JSON))
        assertEquals(listOf("-0", "1", "1", "2", "4.5e-2"), t.map { "-01 1. 2e+ 4.5e-2".substring(it.start, it.end) })
    }
    @Test fun jsonEscapedUnicodeStringIsOneToken() {
        val s = "\"x\\u263A😀\""
        val t = ToolOutputSyntax.tokens(preview(s, ToolOutputKind.JSON))
        assertEquals(listOf(ToolSyntaxRole.STRING), t.map { it.role })
        assertEquals(s, s.substring(t[0].start, t[0].end))
    }
    @Test fun unfinishedStringsDoNotProduceInvalidIntervals() {
        val s = "const x = 'unfinished"
        assertValid(s, ToolOutputSyntax.tokens(preview(s, ToolOutputKind.CODE, "js")))
    }
    @Test fun tokenBudgetOverflowFallsBackEntirely() {
        val s = ("let 1;").repeat(550)
        assertTrue(s.length < 6000)
        assertTrue(ToolOutputSyntax.tokens(preview(s, ToolOutputKind.CODE, "js")).isEmpty())
    }
    @Test fun largeWhitespaceWithinLimitIsSupportedAndEmpty() {
        val p = preview(" ".repeat(6000), ToolOutputKind.CODE, "python")
        assertTrue(ToolOutputSyntax.supports(p)); assertTrue(ToolOutputSyntax.tokens(p).isEmpty())
    }
    @Test fun propertyRoleRequiresJsonKeyColon() {
        val s = "[\"key\", {\"another\": 1}]"
        assertEquals(listOf(ToolSyntaxRole.STRING, ToolSyntaxRole.PROPERTY, ToolSyntaxRole.NUMBER), roles(preview(s, ToolOutputKind.JSON)))
    }

    @Test fun identifierSuffixesAreNotRescannedAsKeywordsOrNumbers() {
        val s = "gift myreturn somethingfalse x123 _if dollar${'$'}const"
        assertTrue(ToolOutputSyntax.tokens(preview(s, ToolOutputKind.CODE, "js")).isEmpty())
        assertTrue(ToolOutputSyntax.tokens(preview(s, ToolOutputKind.CODE, "py")).isEmpty())
    }

    @Test(timeout = 1000) fun longUnknownIdentifierIsConsumedOnce() {
        val s = "a".repeat(5998) + "if"
        assertTrue(ToolOutputSyntax.tokens(preview(s, ToolOutputKind.CODE, "py")).isEmpty())
    }

    @Test fun unfinishedStringContentsAreNotColoredAsCode() {
        val s = "'const return 123"
        assertTrue(ToolOutputSyntax.tokens(preview(s, ToolOutputKind.CODE, "js")).isEmpty())
    }

    @Test fun pythonTripleStringsCanSpanRealLines() {
        val s = "\"\"\"first\nreturn 123\nlast\"\"\""
        val t = ToolOutputSyntax.tokens(preview(s, ToolOutputKind.CODE, "python"))
        assertEquals(1, t.size)
        assertEquals(ToolSyntaxToken(0, s.length, ToolSyntaxRole.STRING), t.single())
    }

    @Test fun javascriptDoesNotTreatQuotesAsPythonTriples() {
        val s = "'''\nlet x = 1"
        val t = ToolOutputSyntax.tokens(preview(s, ToolOutputKind.CODE, "js"))
        assertEquals(listOf(ToolSyntaxRole.STRING, ToolSyntaxRole.KEYWORD, ToolSyntaxRole.NUMBER), t.map { it.role })
    }

    @Test fun numbersDoNotConsumeMemberNamesAndExponentsRemainAtomic() {
        val s = "1..value 1.5e-2 0xFF 0b10 0o77"
        val t = ToolOutputSyntax.tokens(preview(s, ToolOutputKind.CODE, "js"))
        assertEquals(listOf("1", "1.5e-2", "0xFF", "0b10", "0o77"), t.map { s.substring(it.start, it.end) })
    }

    @Test fun literalsAreLanguageSpecific() {
        assertEquals(listOf(ToolSyntaxRole.LITERAL), roles(preview("True true", ToolOutputKind.CODE, "python")))
        assertEquals(listOf(ToolSyntaxRole.LITERAL), roles(preview("True true", ToolOutputKind.CODE, "js")))
    }

    @Test fun exactTokenBudgetIsAllowedAndOneMoreFallsBack() {
        val s = "1 ".repeat(1024)
        assertEquals(1024, ToolOutputSyntax.tokens(preview(s, ToolOutputKind.CODE, "py")).size)
        assertTrue(ToolOutputSyntax.tokens(preview(s + "1", ToolOutputKind.CODE, "py")).isEmpty())
    }

    private fun assertValid(source: String, tokens: List<ToolSyntaxToken>) {
        var end = 0
        tokens.forEach { t ->
            assertTrue(t.start >= end); assertTrue(t.start >= 0); assertTrue(t.end > t.start); assertTrue(t.end <= source.length)
            end = t.end
        }
    }
}
