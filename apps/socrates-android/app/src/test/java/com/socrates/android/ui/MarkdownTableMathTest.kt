package com.socrates.android.ui

import io.noties.markwon.ext.latex.JLatexMathNode
import io.noties.markwon.inlineparser.InlineProcessor
import io.noties.markwon.inlineparser.MarkwonInlineParser
import org.commonmark.ext.gfm.tables.TableCell
import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.node.*
import org.commonmark.parser.Parser
import org.junit.Assert.*
import org.junit.Test

/** Uses the actual 4.6.2 parser and its actual fallback processor, not synthetic math nodes. */
class MarkdownTableMathTest {
    private fun parser(): Parser {
        // The dependency's processor is package-private. Reflection is test-only; production uses
        // JLatexMathPlugin, which installs exactly this processor after MarkdownTableMath.
        val fallback = Class.forName("io.noties.markwon.ext.latex.JLatexMathInlineProcessor")
            .getDeclaredConstructor().apply { isAccessible = true }.newInstance() as InlineProcessor
        val blocks = Class.forName("io.noties.markwon.ext.latex.JLatexMathBlockParser${'$'}Factory")
            .getDeclaredConstructor().newInstance() as org.commonmark.parser.block.BlockParserFactory
        return Parser.builder().extensions(listOf(TablesExtension.create()))
            .customBlockParserFactory(blocks)
            .inlineParserFactory(MarkwonInlineParser.factoryBuilder()
                .addInlineProcessor(MarkdownTableMath()).addInlineProcessor(MarkdownProseMath())
                .addInlineProcessor(fallback).build()).build()
    }
    private fun nodes(root: Node): List<Node> = buildList {
        fun visit(node: Node) { add(node); var child = node.firstChild; while (child != null) { visit(child); child = child.next } }
        visit(root)
    }
    private fun raw(source: String) = parser().parse(source.replace('§', '$'))
    private fun prepared(source: String): Node {
        val input = source.replace('§', '$')
        val token = MarkdownTables.pipeToken(input)
        return parser().parse(MarkdownSource.preview(input, false, token).markdown).also {
            MarkdownTables.restoreMathPipes(it, token)
        }
    }
    private fun cell(body: String): Node = prepared("A|B\n---|---\n$body|value")
        .let { nodes(it).filterIsInstance<TableCell>()[2] }
    private fun math(node: Node) = nodes(node).filterIsInstance<JLatexMathNode>()
    private fun literal(node: Node) = nodes(node).filterIsInstance<Text>().joinToString("") { it.literal }

    @Test fun actualTableCellsParseBothInlineDelimiterForms() {
        assertEquals(listOf("x_i", "y^2"), math(cell("§x_i§ and \\(y^2\\)" )).map { it.latex() })
    }
    @Test fun headerMathUsesSameActualParser() {
        val root = prepared("§x§|B\n---|---\ny|z")
        val header = nodes(root).filterIsInstance<TableCell>().first()
        assertTrue(header.isHeader)
        assertEquals("x", math(header).single().latex())
    }
    @Test fun absoluteValuesNormsAndTexEscapesSurviveGfm() {
        val root = prepared("A|B\n---|---\n\\(|x|+\\|y\\|+\\left|z\\right|\\)|a\\|b")
        assertEquals(4, nodes(root).filterIsInstance<TableCell>().size)
        assertEquals("|x|+\\|y\\|+\\left|z\\right|", math(root).single().latex())
        assertEquals("a|b", literal(nodes(root).filterIsInstance<TableCell>().last()))
    }
    @Test fun existingEmphasisContainsMathWithoutReparsing() {
        val root = cell("**§x§** and *§y§*")
        assertEquals("x", math(nodes(root).filterIsInstance<StrongEmphasis>().single()).single().latex())
        assertEquals("y", math(nodes(root).filterIsInstance<Emphasis>().single()).single().latex())
    }
    @Test fun referenceLinksKeepResolvedDestinationTitleAndMathLabel() {
        val root = prepared("A|B\n---|---\n[§x§][ref]|value\n\n[ref]: https://example.invalid/path \"title\"")
        val link = nodes(root).filterIsInstance<Link>().single()
        assertEquals("https://example.invalid/path", link.destination)
        assertEquals("title", link.title)
        assertEquals("x", math(link).single().latex())
    }
    @Test fun codeSpansAreOpaqueIncludingEscapedPipeAndMath() {
        val root = cell("`§x§ a\\|b` and ``a ` \\(z\\)`` and §y§")
        assertEquals(listOf("§x§ a|b", "a ` \\(z\\)").map { it.replace('§', '$') }, nodes(root).filterIsInstance<Code>().map { it.literal })
        assertEquals("y", math(root).single().latex())
    }
    @Test fun escapedDollarsPricesAndProseStayLiteral() {
        val root = cell("\\§x\\§ §5-§10 §only§ §y§")
        assertEquals("§x§ §5-§10 §only§ ".replace('§', '$'), literal(root))
        assertEquals("y", math(root).single().latex())
    }
    @Test fun mathSourceIsOpaqueToMarkdownAndHtml() {
        val root = cell("\\(a_1 * b_2 + \\text{<script>alert(1)</script>}\\)")
        assertEquals("a_1 * b_2 + \\text{<script>alert(1)</script>}", math(root).single().latex())
        assertFalse(nodes(root).any { it is HtmlInline || it is Link || it is Emphasis })
    }
    @Test fun htmlAttributesAndLinkDestinationsAreNotReparsedByProcessor() {
        val root = raw("A|B\n---|---\n<span title='§§x§§'>safe</span> [label](https://example.invalid/§§y§§ \"§§z§§\")|value")
        assertTrue(math(root).isEmpty())
        val link = nodes(root).filterIsInstance<Link>().single()
        assertEquals("https://example.invalid/§§y§§".replace('§', '$'), link.destination)
        assertEquals("§§z§§".replace('§', '$'), link.title)
    }
    @Test fun exactLengthBudgetRenders() {
        val body = "x".repeat(MarkdownTableMath.MAX_MATH_LENGTH)
        assertEquals(body, math(cell("\\($body\\)")).single().latex())
    }
    @Test fun overLengthBudgetIsWholeLiteralAndCannotReachDefaultProcessor() {
        val body = "x".repeat(MarkdownTableMath.MAX_MATH_LENGTH + 1)
        val root = cell("\\($body\\) and §y§")
        assertEquals("y", math(root).single().latex())
        assertTrue(literal(root).contains("§§$body§§".replace('§', '$')))
    }
    @Test fun shieldExpansionCountsConservativelyAndRestoresLiteralPipes() {
        val body = "|".repeat(MarkdownTableMath.MAX_MATH_LENGTH / 2)
        val root = cell("\\($body\\)")
        assertTrue(math(root).isEmpty())
        assertEquals("§§$body§§".replace('§', '$'), literal(root))
    }
    @Test fun exactCountBudgetRendersAllNodes() {
        assertEquals(MarkdownTableMath.MAX_MATH_PER_CELL, math(cell(List(MarkdownTableMath.MAX_MATH_PER_CELL) { "§x§" }.joinToString(" "))).size)
    }
    @Test fun overCountBudgetStaysLiteralWithoutFallbackBypass() {
        val root = cell(List(MarkdownTableMath.MAX_MATH_PER_CELL + 2) { "§x§" }.joinToString(" "))
        assertEquals(MarkdownTableMath.MAX_MATH_PER_CELL, math(root).size)
        assertEquals(2, Regex(Regex.escape("§§x§§".replace('§', '$'))).findAll(literal(root)).count())
    }
    @Test fun literalDollarCannotJumpForwardPastLengthBudget() {
        val body = "x".repeat(MarkdownTableMath.MAX_MATH_LENGTH + 1)
        val root = cell("§5 fee \\($body\\)")
        assertTrue(math(root).isEmpty())
        assertEquals("§5 fee §§$body§§".replace('§', '$'), literal(root))
    }
    @Test fun literalDollarCannotJumpForwardPastCountBudget() {
        val root = cell(List(MarkdownTableMath.MAX_MATH_PER_CELL) { "§x§" }.joinToString(" ") + " §5 fee \\(y\\)")
        assertEquals(MarkdownTableMath.MAX_MATH_PER_CELL, math(root).size)
        assertTrue(literal(root).endsWith("§5 fee §§y§§".replace('§', '$')))
    }
    @Test fun countBudgetResetsForEveryCellAndRow() {
        val value = List(MarkdownTableMath.MAX_MATH_PER_CELL) { "§x§" }.joinToString(" ")
        val root = prepared("$value|$value\n---|---\n$value|$value\n$value|$value")
        assertTrue(nodes(root).filterIsInstance<TableCell>().all { math(it).size == MarkdownTableMath.MAX_MATH_PER_CELL })
    }
    @Test fun rejectedLongFormulaDoesNotSpendNodeBudget() {
        val root = cell("\\(${"x".repeat(MarkdownTableMath.MAX_MATH_LENGTH + 1)}\\) " + List(MarkdownTableMath.MAX_MATH_PER_CELL) { "§y§" }.joinToString(" "))
        assertEquals(MarkdownTableMath.MAX_MATH_PER_CELL, math(root).size)
    }
    @Test fun unmatchedAndEmptyNormalizedDelimitersAreLiteralWithinTheirCell() {
        listOf("§§x", "§§§§").forEach { source ->
            val root = raw("A|B\n---|---\n$source|next\n§§y§§|last")
            val cells = nodes(root).filterIsInstance<TableCell>()
            assertTrue(math(cells[2]).isEmpty())
            assertEquals(source.replace('§', '$'), literal(cells[2]))
            assertEquals("next", literal(cells[3]))
            assertEquals("y", math(cells[4]).single().latex())
        }
    }
    @Test fun proseDoesNotInheritCellLengthBudget() {
        val body = "x".repeat(MarkdownTableMath.MAX_MATH_LENGTH + 1)
        assertEquals(body, math(raw("before §§$body§§")).single().latex())
    }
    @Test fun unmatchedOpenerDoesNotSwallowFollowingLinksEmphasisOrCode() {
        val root = raw("A|B\n---|---\n§§x [label](https://example.invalid) **bold** `code`|value")
        assertTrue(math(root).isEmpty())
        assertEquals("https://example.invalid", nodes(root).filterIsInstance<Link>().single().destination)
        assertTrue(nodes(root).any { it is StrongEmphasis })
        assertEquals("code", nodes(root).filterIsInstance<Code>().single().literal)
    }
    @Test fun escapedDoubleDollarInsideTexIsNotACloser() {
        val root = cell("\\(x+\\§§+y\\)")
        assertEquals("x+\\§§+y".replace('§', '$'), math(root).single().latex())
    }
    @Test fun adjacentFormulasDoNotCreateEmptyOrOverlappingNodes() {
        assertEquals(listOf("x", "y"), math(raw("A|B\n---|---\n§§x§§§§y§§|value")).map { it.latex() })
    }
    @Test fun rejectedFormulaContentCannotTurnIntoAnActiveLink() {
        val source = "[unsafe](javascript:alert)" + "x".repeat(MarkdownTableMath.MAX_MATH_LENGTH)
        val root = cell("\\($source\\)")
        assertTrue(math(root).isEmpty())
        assertFalse(nodes(root).any { it is Link })
        assertTrue(literal(root).contains("[unsafe](javascript:alert)"))
    }
    @Test fun quotedTableKeepsContainerAndReceivesCellBudget() {
        val root = prepared("> A|B\n> ---|---\n> §x§|value")
        assertTrue(root.firstChild is BlockQuote)
        assertEquals("x", math(root).single().latex())
    }
    @Test fun extractingCellsRetainsRealMathNodesAndResolvedLinks() {
        val root = prepared("before\n\nA|B\n---|---\n[§x§][ref]|value\n\nafter\n\n[ref]: https://example.invalid/ref")
        val blocks = MarkdownTables.blocks(root)
        assertEquals(3, blocks.size)
        val cell = (blocks[1] as MarkdownTables.Block.Table).rows.last().cells.first().node
        assertEquals("x", math(cell).single().latex())
        assertEquals("https://example.invalid/ref", nodes(cell).filterIsInstance<Link>().single().destination)
    }
    @Test fun displayNormalizationCannotBeClaimedAsCellMath() {
        listOf("\\[x\\]", "§§x§§").forEach { display ->
            val root = prepared("A|B\n---|---\n$display|value")
            assertTrue(nodes(root).filterIsInstance<TableCell>().all { math(it).isEmpty() })
            assertTrue(nodes(root).any { it is io.noties.markwon.ext.latex.JLatexMathBlock })
        }
    }
}
