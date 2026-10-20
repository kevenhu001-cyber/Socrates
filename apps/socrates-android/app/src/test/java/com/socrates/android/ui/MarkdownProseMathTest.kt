package com.socrates.android.ui

import io.noties.markwon.ext.latex.JLatexMathBlock
import io.noties.markwon.ext.latex.JLatexMathNode
import io.noties.markwon.inlineparser.InlineProcessor
import io.noties.markwon.inlineparser.MarkwonInlineParser
import org.commonmark.ext.gfm.tables.TableCell
import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.node.*
import org.commonmark.parser.Parser
import org.junit.Assert.*
import org.junit.Test

/** Real Markwon 4.6.2 processors: normalization alone cannot detect forward-search loss. */
class MarkdownProseMathTest {
    private fun parser(): Parser {
        val fallback = Class.forName("io.noties.markwon.ext.latex.JLatexMathInlineProcessor")
            .getDeclaredConstructor().apply { isAccessible = true }.newInstance() as InlineProcessor
        val blocks = Class.forName("io.noties.markwon.ext.latex.JLatexMathBlockParser${'$'}Factory")
            .getDeclaredConstructor().newInstance() as org.commonmark.parser.block.BlockParserFactory
        return Parser.builder().extensions(listOf(TablesExtension.create())).customBlockParserFactory(blocks)
            .inlineParserFactory(MarkwonInlineParser.factoryBuilder()
                .addInlineProcessor(MarkdownTableMath()).addInlineProcessor(MarkdownProseMath())
                .addInlineProcessor(fallback).build()).build()
    }
    private fun s(value: String) = value.replace('§', '$')
    private fun raw(source: String) = parser().parse(s(source))
    private fun prepared(source: String) = parser().parse(MarkdownSource.normalize(s(source)))
    private fun nodes(root: Node): List<Node> = buildList {
        fun visit(node: Node) { add(node); var child = node.firstChild; while (child != null) { visit(child); child = child.next } }
        visit(root)
    }
    private fun math(root: Node) = nodes(root).filterIsInstance<JLatexMathNode>().map { it.latex() }
    private fun literal(root: Node) = nodes(root).filterIsInstance<Text>().joinToString("") { it.literal }

    @Test fun ordinaryDollarCannotSkipPricesAndTextToLaterFormula() {
        val root = prepared("花了 §5，概率 §1/2§，变量 §x§")
        assertEquals(s("花了 §5，概率 ，变量 "), literal(root))
        assertEquals(listOf("1/2", "x"), math(root))
    }
    @Test fun priceRangesAndLowercaseWordsSurviveBeforeMath() {
        val prefix = "§5-§10 §1,000-§2,000 §only§ §note see above§ "
        val root = prepared(prefix + "§y§")
        assertEquals(s(prefix), literal(root))
        assertEquals(listOf("y"), math(root))
    }
    @Test fun singleDollarWithoutFormulaDoesNotConsumeSuffix() {
        val value = "fee §5 and text §only§; dangling §"
        val root = prepared(value)
        assertEquals(s(value), literal(root))
        assertTrue(math(root).isEmpty())
    }
    @Test fun adjacentSingleDollarAndNormalizedFormulaHaveExactBounds() {
        val root = raw("a §5 §§x§§ b § §§y§§ tail")
        assertEquals(s("a §5  b §  tail"), literal(root))
        assertEquals(listOf("x", "y"), math(root))
    }
    @Test fun escapedDollarsDoNotHideLaterFormula() {
        val root = prepared("""\§x\§ and \§5 then §y§""")
        assertEquals(s("§x§ and §5 then "), literal(root))
        assertEquals(listOf("y"), math(root))
    }
    @Test fun evenBackslashesKeepMathOpenerActive() {
        val root = prepared("""\\§x§""")
        assertEquals("\\", literal(root))
        assertEquals(listOf("x"), math(root))
    }
    @Test fun inlineCodeRemainsOpaqueAfterLiteralDollar() {
        val root = prepared("""§5 `§x§` ``a ` \(z\)`` then §y§""")
        assertEquals(s("§5   then "), literal(root))
        assertEquals(listOf(s("§x§"), """a ` \(z\)"""), nodes(root).filterIsInstance<Code>().map { it.literal })
        assertEquals(listOf("y"), math(root))
    }
    @Test fun fencedCodeRemainsOpaqueAndFollowingMathParses() {
        listOf("```", "~~~~").forEach { marker ->
            val code = s("""§5 §x§ \(z\)""") + "\n"
            val root = prepared("$marker\n$code$marker\n\n§5 then §y§")
            assertEquals(code, nodes(root).filterIsInstance<FencedCodeBlock>().single().literal)
            assertEquals(s("§5 then "), literal(root))
            assertEquals(listOf("y"), math(root))
        }
    }
    @Test fun singleDollarDoesNotSwallowLinksEmphasisOrCode() {
        val root = prepared("§5 [label](https://example.invalid) **bold** `code` §x§")
        assertEquals("https://example.invalid", nodes(root).filterIsInstance<Link>().single().destination)
        assertTrue(nodes(root).any { it is StrongEmphasis })
        assertEquals("code", nodes(root).filterIsInstance<Code>().single().literal)
        assertEquals(s("§5 label bold  "), literal(root))
        assertEquals(listOf("x"), math(root))
    }
    @Test fun emphasisAndReferenceLabelsKeepMathNodes() {
        val root = prepared("§5 **§x§** [§y§][ref]\n\n[ref]: https://example.invalid/ref \"title\"")
        assertEquals(listOf("x"), math(nodes(root).filterIsInstance<StrongEmphasis>().single()))
        val link = nodes(root).filterIsInstance<Link>().single()
        assertEquals("https://example.invalid/ref", link.destination)
        assertEquals("title", link.title)
        assertEquals(listOf("y"), math(link))
        assertEquals(s("§5  "), literal(root))
    }
    @Test fun htmlAttributesAndLinkDestinationsAreNotReparsed() {
        val root = raw("§5 <span title='§§x§§'>safe</span> [label](https://example.invalid/§§y§§ \"§§z§§\")")
        assertTrue(math(root).isEmpty())
        assertEquals(2, nodes(root).filterIsInstance<HtmlInline>().size)
        val link = nodes(root).filterIsInstance<Link>().single()
        assertEquals(s("https://example.invalid/§§y§§"), link.destination)
        assertEquals(s("§§z§§"), link.title)
        assertEquals(s("§5 safe label"), literal(root))
    }
    @Test fun explicitInlineAndDisplayDelimitersKeepTheirKinds() {
        val root = prepared("§5 \\(only\\)\n\n\\[x^2\\]\n\n§§y^2§§")
        assertEquals(listOf("only"), math(root))
        assertEquals(2, nodes(root).filterIsInstance<JLatexMathBlock>().size)
        assertEquals(s("§5 "), literal(root))
    }
    @Test fun acceptedTexIsOpaqueToMarkdownAndHtml() {
        val body = "a_1 * b_2 + \\text{<script>alert(1)</script>} + [x](javascript:alert)"
        val root = prepared("§5 \\($body\\)")
        assertEquals(listOf(body), math(root))
        assertFalse(nodes(root).any { it is Link || it is Emphasis || it is HtmlInline })
        assertEquals(s("§5 "), literal(root))
    }
    @Test fun unmatchedOpenerOnlyConsumesTwoCharacters() {
        val root = raw("before §§x [label](https://example.invalid) **bold** `code`")
        assertTrue(math(root).isEmpty())
        assertEquals(s("before §§x label bold "), literal(root))
        assertEquals("https://example.invalid", nodes(root).filterIsInstance<Link>().single().destination)
        assertTrue(nodes(root).any { it is StrongEmphasis })
        assertEquals("code", nodes(root).filterIsInstance<Code>().single().literal)
    }
    @Test fun emptyMarkersDoNotSearchForwardOrSwallowText() {
        val root = raw("before §§§§ middle §§x§§ after")
        assertEquals(s("before §§§§ middle  after"), literal(root))
        assertEquals(listOf("x"), math(root))
    }
    @Test fun adjacentFormulasHaveNoOverlappingOrEmptyNodes() {
        val root = raw("before §§x§§§§y§§ after")
        assertEquals(listOf("x", "y"), math(root))
        assertEquals("before  after", literal(root))
    }
    @Test fun escapedDollarPairInsideTexIsNotACloser() {
        val root = prepared("§5 \\(x+\\§§+y\\) tail")
        assertEquals(listOf(s("x+\\§§+y")), math(root))
        assertEquals(s("§5  tail"), literal(root))
    }
    @Test fun escapedDollarBeforeDigitKeepsTheActualCloserAndNextFormula() {
        val root = raw("before §§(\\§5§§ middle §§y§§ tail")
        assertEquals(listOf(s("(\\§5"), "y"), math(root))
        assertEquals("before  middle  tail", literal(root))
    }
    @Test fun escapedDollarAtBodyEndDoesNotEscapeTheActualCloser() {
        val root = prepared("before \\(x+\\§\\) middle \\(y\\) tail")
        assertEquals(listOf(s("x+\\§"), "y"), math(root))
        assertEquals("before  middle  tail", literal(root))
    }
    @Test fun texCommandsDoNotHideTheActualCloserOrFollowingText() {
        val body = "\\frac{1}{2}+\\alpha"
        val root = prepared("§5 \\($body\\) middle §y§ tail")
        assertEquals(listOf(body, "y"), math(root))
        assertEquals(s("§5  middle  tail"), literal(root))
    }
    @Test fun evenBackslashRunAllowsFollowingCloser() {
        val root = raw("before §§x\\\\§§ tail")
        assertEquals(listOf("x\\\\"), math(root))
        assertEquals("before  tail", literal(root))
    }
    @Test fun escapedOpeningPairStaysLiteral() {
        val root = raw("before \\§\\§x\\§\\§ then §§y§§")
        assertEquals(s("before §§x§§ then "), literal(root))
        assertEquals(listOf("y"), math(root))
    }
    @Test fun unclosedAndEmptyAuthorDelimitersStayLiteral() {
        listOf("text \\(x", "text \\[x", "text §§x", "text \\(\\)", "text \\[  \\]", "text §§  §§").forEach { value ->
            val root = prepared(value)
            assertTrue(value, math(root).isEmpty())
            assertFalse(value, nodes(root).any { it is JLatexMathBlock })
        }
    }
    @Test fun proseDoesNotInheritCellLengthOrCountBudgets() {
        val body = "x".repeat(MarkdownTableMath.MAX_MATH_LENGTH + 1)
        val root = prepared("§5 \\($body\\) " + List(MarkdownTableMath.MAX_MATH_PER_CELL + 1) { "§y§" }.joinToString(" "))
        assertEquals(listOf(body) + List(MarkdownTableMath.MAX_MATH_PER_CELL + 1) { "y" }, math(root))
        assertTrue(literal(root).startsWith(s("§5 ")))
    }
    @Test fun inlineExplicitMultilineBodyRetainsExistingProseBehavior() {
        val root = prepared("before \\(a+\nb\\) after")
        assertEquals(listOf("a+\nb"), math(root))
        assertEquals("before  after", literal(root))
    }
    @Test fun listQuoteAndHeadingUseTheSameAnchoredPolicy() {
        val root = prepared("# §5 then §x§\n\n> §10 then §y§\n\n- §20 then §z§")
        assertEquals(listOf("x", "y", "z"), math(root))
        assertEquals(s("§5 then §10 then §20 then "), literal(root))
        assertTrue(nodes(root).any { it is Heading })
        assertTrue(nodes(root).any { it is BlockQuote })
        assertTrue(nodes(root).any { it is ListItem })
    }
    @Test fun reusedParserDoesNotCarryStateBetweenMessages() {
        val parser = parser()
        repeat(3) {
            val root = parser.parse(MarkdownSource.normalize(s("§5 then §x§")))
            assertEquals(listOf("x"), math(root))
            assertEquals(s("§5 then "), literal(root))
        }
    }
    @Test fun proseProcessorCannotBypassTableBudgets() {
        val body = "x".repeat(MarkdownTableMath.MAX_MATH_LENGTH + 1)
        val root = prepared("§5 \\($body\\)\n\nA|B\n---|---\n§5 \\($body\\)|value")
        assertEquals(listOf(body), math(root))
        val cell = nodes(root).filterIsInstance<TableCell>()[2]
        assertTrue(math(cell).isEmpty())
        assertEquals(s("§5 §§$body§§"), literal(cell))
    }
}
