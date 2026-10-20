package com.socrates.android.ui

import org.junit.Assert.*
import org.junit.Test

class MarkdownStreamingTest {
    private fun s(value: String) = value.replace('§', '$')
    private fun preview(value: String) = MarkdownSource.preview(s(value), streaming = true)
    private fun pending(value: String, prefix: String, tail: String) {
        val result = preview(value)
        assertEquals(s(prefix), result.markdown)
        assertEquals(s(tail), result.pendingMath)
    }
    private fun noPending(value: String) {
        assertNull(preview(value).pendingMath)
    }

    @Test fun parenthesizedTailIsSeparateLiteralSource() { pending("设 \\(x_i", "设 ", "\\(x_i") }
    @Test fun bracketTailIsSeparateLiteralSource() { pending("结果：\\[\\frac{1}", "结果：", "\\[\\frac{1}") }
    @Test fun dollarDisplayTailIsSeparateLiteralSource() { pending("结果：§§x^2", "结果：", "§§x^2") }
    @Test fun emptyExplicitOpenersWaitWithoutInventingBody() {
        listOf("\\(", "\\[", "§§").forEach { pending(it, "", it) }
    }
    @Test fun pendingBodyDoesNotInterpretMarkdownOrHtml() {
        pending("\\[x_i **bold** <img src=x>", "", "\\[x_i **bold** <img src=x>")
    }
    @Test fun pendingBodyRetainsNewlinesWhitespaceAndUnicode() {
        pending("前文\\[\r\n α_i  \n", "前文", "\\[\r\n α_i  \n")
    }
    @Test fun closedInlineMathUsesNormalNativeInput() {
        assertEquals(s("设 §§x_i§§"), preview("设 \\(x_i\\)").markdown)
        noPending("设 \\(x_i\\)")
    }
    @Test fun closedDisplayMathUsesNormalNativeInput() {
        listOf("\\[x_i\\]", "§§x_i§§").forEach {
            assertEquals(s("\n\n§§\nx_i\n§§\n\n"), preview(it).markdown)
            noPending(it)
        }
    }
    @Test fun finalOrStoppedInputNeverGetsPendingTreatment() {
        listOf("\\(x_", "\\[\\frac{1}", "§§x_", "` \\(x").forEach {
            val source = s(it)
            val result = MarkdownSource.preview(source, streaming = false)
            assertNull(result.pendingMath)
            assertEquals(MarkdownSource.normalize(source), result.markdown)
        }
    }
    @Test fun singleDollarAndPricesAreNeverPending() {
        listOf("§x_", "§5", "§5-§10", "§only§").forEach(::noPending)
    }
    @Test fun priceBeforeExplicitTailRetainsLiteralPrefixAndWholePendingBody() {
        pending("§5 then \\(x+\\§§+y", "§5 then ", "\\(x+\\§§+y")
    }
    @Test fun priceBeforeCompletedExplicitMathDoesNotCreatePendingTail() {
        val result = preview("§5 then \\(x+\\§§+y\\) tail")
        assertEquals(s("§5 then §§x+\\§§+y§§ tail"), result.markdown)
        assertNull(result.pendingMath)
    }
    @Test fun closedFormulaBeforePendingTailIsAlreadyNormalized() {
        pending("§x§ 再 \\[a_", "§§x§§ 再 ", "\\[a_")
    }
    @Test fun completedFormulaDoesNotConsumeLaterOpenFormula() {
        pending("\\(x\\) 然后 \\(y", "§§x§§ 然后 ", "\\(y")
    }
    @Test fun escapedOpenersAreNotPending() {
        listOf("\\\\(x", "\\\\[x", "\\§§x").forEach(::noPending)
    }
    @Test fun evenBackslashesAllowFollowingOpener() { pending("\\\\§§x", "\\\\", "§§x") }
    @Test fun escapedCloserKeepsTailPending() { pending("\\(x\\\\)", "", "\\(x\\\\)") }
    @Test fun escapedDollarCloserKeepsTailPending() { pending("§§x\\§§", "", "§§x\\§§") }
    @Test fun closedCodeSpanIsOpaque() {
        listOf("`\\(x`", "``a ` \\[x``", "`§§x`").forEach(::noPending)
    }
    @Test fun openCodeSpanIsConservativelyOpaqueUntilFinal() {
        listOf("`\\(x", "``a ` §§x").forEach(::noPending)
    }
    @Test fun formulaAfterClosedCodeIsStillPending() { pending("`code` \\[x", "`code` ", "\\[x") }
    @Test fun fencedCodeIsOpaqueIncludingUnclosedFences() {
        listOf("```tex\n\\[x", "~~~tex\n§§x\n~~~", "   ````tex\n\\(x\n````").forEach(::noPending)
    }
    @Test fun tailAfterFenceIsDetected() { pending("```\ncode\n```\n\\[x", "```\ncode\n```\n", "\\[x") }
    @Test fun closedEmptyMathIsNotPending() { listOf("\\(\\)", "\\[ \\]", "§§ §§").forEach(::noPending) }
    @Test fun everyGrowingPrefixPreservesPendingSourceWithoutFabricatedClosers() {
        val source = "prefix \\[\\frac{1}{2}\\]"
        for (length in 9 until source.length) {
            val prefix = source.take(length)
            val result = MarkdownSource.preview(prefix, true)
            assertEquals("prefix ", result.markdown)
            assertEquals(prefix.removePrefix("prefix "), result.pendingMath)
        }
        assertNull(MarkdownSource.preview(source, true).pendingMath)
    }
    @Test fun incompleteInputMayContainProseButNoTailContentIsDropped() {
        pending("\\[x\n后续正文", "", "\\[x\n后续正文")
    }
    @Test fun repeatedUnclosedOpenersRemainOneLiteralTail() {
        val source = "\\[".repeat(10_000)
        val result = preview(source)
        assertEquals("", result.markdown)
        assertEquals(source, result.pendingMath)
    }
    @Test fun normalMarkdownIsUnchanged() { assertEquals("# Title\n\n**bold** _italic_", preview("# Title\n\n**bold** _italic_").markdown) }
}
