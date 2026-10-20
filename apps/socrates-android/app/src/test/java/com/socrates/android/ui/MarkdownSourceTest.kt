package com.socrates.android.ui

import org.junit.Assert.*
import org.junit.Test

class MarkdownSourceTest {
    private fun s(value: String) = value.replace('§', '$')
    private fun unchanged(value: String) = assertEquals(s(value), MarkdownSource.normalize(s(value)))
    private fun inline(body: String) = assertEquals(s("§§$body§§"), MarkdownSource.normalize(s("§$body§")))

    @Test fun inlineDollarMath() { assertEquals(s("设 §§V_b = 0§§ 为参考"), MarkdownSource.normalize(s("设 §V_b = 0§ 为参考"))) }
    @Test fun parenthesizedMath() { assertEquals(s("§§x_i§§"), MarkdownSource.normalize("\\(x_i\\)")) }
    @Test fun bracketDisplayMath() { assertEquals(s("\n\n§§\n\\boxed{40\\Omega}\n§§\n\n"), MarkdownSource.normalize("\\[\\boxed{40\\Omega}\\]")) }
    @Test fun compactDisplayMath() { assertEquals(s("\n\n§§\nx^2\n§§\n\n"), MarkdownSource.normalize(s("§§x^2§§"))) }
    @Test fun fencedCodeIsOpaque() { unchanged("```kotlin\nval x = \"§value§\"\n```") }
    @Test fun inlineCodeIsOpaque() { unchanged("`\\(x\\) §x§`") }
    @Test fun tildesAreOpaque() { unchanged("~~~\n§x§\n~~~") }
    @Test fun incompleteStreamIsLiteral() { listOf("设 §x", "\\[\\frac{1}", "```\n§x§").forEach(::unchanged) }
    @Test fun escapedDollarAndPricesRemainLiteral() { unchanged("花费 \\§5 和 §5 and §10") }
    @Test fun multipleInlineFormulas() { assertEquals(s("§§a§§ 到 §§b§§"), MarkdownSource.normalize(s("§a§ 到 \\(b\\)"))) }
    @Test fun multilineMathKeepsAlignedEnvironment() { val value = "\\[\\begin{aligned}U&=-40\\\\R&=40\\end{aligned}\\]"; assertTrue(MarkdownSource.normalize(value).contains("\\begin{aligned}U&=-40\\\\R&=40\\end{aligned}")) }

    @Test fun priceRangesAreNotSubtractionFormulas() { listOf("§5-§10", "§5–§10", "§1,000-§2,000", "§5 到 §10").forEach(::unchanged) }
    @Test fun lowercaseWordsAndProseAreNotFormulas() { listOf("§only§", "§home§", "§xMax§", "§5 USD§", "§note see above§", "§5 (approx)§").forEach(::unchanged) }
    @Test fun numericFormulasFollowWebPolicy() { listOf("1/2", "3+4=7", "2^{10}", "-1", "0.5", "5", "1,000").forEach(::inline) }
    @Test fun danglingNumericOperatorsRemainLiteral() { listOf("§5-§", "§/2§", "§1+§", "§+1§").forEach(::unchanged) }
    @Test fun symbolsAndCoordinateLabelsAreMath() { listOf("x", "D", "AB", "Oxyz", "P(x,y)", "x，y", "a^2", "\\alpha").forEach(::inline) }
    @Test fun spacedFunctionCallsAndSymbolListsAreMath() { listOf("u(x, y)", "f(x, y, z)", "x, y", "a_1, a_2", "x | y", "a => b", "x； y").forEach(::inline) }
    @Test fun currencyDoesNotConsumeNextFormulaOpener() {
        assertEquals(s("花了 §5，概率 §§1/2§§，变量 §§x§§"), MarkdownSource.normalize(s("花了 §5，概率 §1/2§，变量 §x§")))
    }
    @Test fun currencyCannotBorrowExplicitInlineTexAsMathEvidence() {
        assertEquals(s("§5 then §§x§§ and §§y§§"), MarkdownSource.normalize(s("§5 then \\(x\\) and §y§")))
    }
    @Test fun currencyCannotBorrowExplicitDisplayTexAsMathEvidence() {
        assertEquals(s("§5 then \n\n§§\nx\n§§\n\n and §§y§§"), MarkdownSource.normalize(s("§5 then \\[x\\] and §y§")))
    }
    @Test fun currencyBeforeExplicitTexWithEscapedDollarsIsPreserved() {
        assertEquals(s("§5 §§x+\\§§+y§§ tail"), MarkdownSource.normalize(s("§5 \\(x+\\§§+y\\) tail")))
    }
    @Test fun explicitOpenerInsideEscapedBackslashRunIsNotABoundary() {
        inline("x+\\\\(y)")
    }
    @Test fun numericCloserBeforeDigitRemainsLiteral() { unchanged("§1/2§3") }
    @Test fun whitespaceAtDollarEdgesIsLiteral() { listOf("§ x§", "§x §", "§1/2 §", "§ 1/2§").forEach(::unchanged) }
    @Test fun inlineDollarCannotCrossLineOrCodeSpan() { listOf("§x\ny§", "§x `y` z§").forEach(::unchanged) }
    @Test fun displayDollarsAreNeverInlineClosers() {
        assertEquals(s("§x \n\n§§\ny\n§§\n\n"), MarkdownSource.normalize(s("§x §§y§§")))
    }
    @Test fun explicitDelimitersDoNotUseDollarHeuristics() {
        assertEquals(s("§§only§§"), MarkdownSource.normalize("\\(only\\)"))
        assertEquals(s("\n\n§§\nonly\n§§\n\n"), MarkdownSource.normalize("\\[only\\]"))
    }
    @Test fun emptyExplicitDelimitersRemainLiteral() { listOf("\\(\\)", "\\[  \\]", "§§  §§").forEach(::unchanged) }
    @Test fun escapedClosingDollarIsNotACloser() { inline("x + \\§5") }
    @Test fun escapedParenthesisCloserIsIgnored() {
        assertEquals(s("§§a\\\\) + b§§"), MarkdownSource.normalize("\\(a\\\\) + b\\)"))
    }
    @Test fun escapedDisplayCloserIsIgnored() {
        assertEquals(s("\n\n§§\nx \\§§ y\n§§\n\n"), MarkdownSource.normalize(s("§§x \\§§ y§§")))
    }
    @Test fun escapedOpeningDelimiterRemainsLiteral() { unchanged("\\\\(x\\)") }
    @Test fun doubleBacktickCodeIgnoresSingleTicksInside() { unchanged("``a ` §x§ \\(b\\)``") }
    @Test fun longerBacktickRunsAreNotShorterClosers() { unchanged("``a ``` §x§``") }
    @Test fun unmatchedBacktickDoesNotHideFollowingMath() {
        assertEquals(s("`unfinished §§x§§"), MarkdownSource.normalize(s("`unfinished §x§")))
    }
    @Test fun codeSpanMayContainLineBreak() { unchanged("``a\n§x§ \\[y\\]``") }
    @Test fun escapedBacktickIsNotCodeOpener() {
        assertEquals(s("\\`literal §§x§§"), MarkdownSource.normalize(s("\\`literal §x§")))
    }
    @Test fun longerFenceKeepsShortFenceInCode() { unchanged("````text\n```\n§x§\n````") }
    @Test fun longerClosingFenceIsAccepted() {
        assertEquals(s("```\n§x§\n````\n§§y§§"), MarkdownSource.normalize(s("```\n§x§\n````\n§y§")))
    }
    @Test fun tildeFenceRequiresLineStart() {
        assertEquals(s("a ~~~ §§x§§ ~~~"), MarkdownSource.normalize(s("a ~~~ §x§ ~~~")))
    }
    @Test fun indentedFenceAndCrLfRemainOpaque() { unchanged("   ~~~~text\r\n§x§\r\n   ~~~~~\t\r\n") }
    @Test fun streamingFenceStaysOpaqueUntilClosed() { unchanged("~~~text\n§x§\n~~\n§y§") }
    @Test fun fenceClosingLineCannotCarryText() { unchanged("```text\n```not closed\n§x§") }
    @Test fun backtickInFenceInfoPreventsFence() {
        assertEquals(s("```a` §§x§§"), MarkdownSource.normalize(s("```a` §x§")))
    }
    @Test fun isolatedFormulasNormalizeConsistentlyAsMessageGrows() {
        val source = s("设 §x§，再考虑 \\[a+b\\]")
        source.indices.forEach { index ->
            val prefix = source.take(index + 1)
            assertTrue(MarkdownSource.normalize(prefix).isNotEmpty())
        }
        assertEquals(s("设 §§x§§，再考虑 \n\n§§\na+b\n§§\n\n"), MarkdownSource.normalize(source))
    }
    @Test fun unmatchedBacktickRunsDoNotRequireQuadraticRescans() {
        val source = (1..500).joinToString(" ") { "`".repeat(it) } + s(" §x§")
        assertTrue(MarkdownSource.normalize(source).endsWith(s("§§x§§")))
    }

    @Test fun evenBackslashesDoNotEscapeDollarOpener() {
        assertEquals(s("\\\\§§x§§"), MarkdownSource.normalize(s("\\\\§x§")))
    }

    @Test fun escapedPriceDoesNotHideNextFormula() {
        assertEquals(s("\\§5 and §§x§§"), MarkdownSource.normalize(s("\\§5 and §x§")))
    }

    @Test fun unicodeOperatorsMatchWebMathEvidence() {
        listOf("x→y", "A∈B", "x⇒y", "A⊂B", "x≤y", "∏x", "x±y").forEach(::inline)
    }

    @Test fun repeatedUnclosedExplicitDelimitersRemainLiteral() {
        val source = "\\(\\[".repeat(10_000)
        assertEquals(source, MarkdownSource.normalize(source))
    }
}
