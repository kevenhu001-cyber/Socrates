package com.socrates.android.ui

import io.noties.markwon.ext.latex.JLatexMathBlock
import io.noties.markwon.ext.latex.JLatexMathNode
import io.noties.markwon.inlineparser.InlineProcessor
import io.noties.markwon.inlineparser.MarkwonInlineParser
import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.node.*
import org.commonmark.parser.Parser
import org.commonmark.parser.block.BlockParserFactory
import org.junit.Assert.*
import org.junit.Test

class MarkdownContainerMathTest {
    private fun s(value: String) = value.replace('§', '$')
    private fun parser(math: Boolean = true): Parser {
        val builder = Parser.builder().extensions(listOf(TablesExtension.create()))
        if (math) {
            val fallback = Class.forName("io.noties.markwon.ext.latex.JLatexMathInlineProcessor")
                .getDeclaredConstructor().apply { isAccessible = true }.newInstance() as InlineProcessor
            val blocks = Class.forName("io.noties.markwon.ext.latex.JLatexMathBlockParser${'$'}Factory")
                .getDeclaredConstructor().newInstance() as BlockParserFactory
            builder.customBlockParserFactory(blocks).inlineParserFactory(MarkwonInlineParser.factoryBuilder()
                .addInlineProcessor(MarkdownTableMath()).addInlineProcessor(MarkdownProseMath())
                .addInlineProcessor(fallback).build())
        }
        return builder.build()
    }
    private fun all(root: Node): List<Node> = buildList {
        fun visit(node: Node) { add(node); var child = node.firstChild; while (child != null) { visit(child); child = child.next } }
        visit(root)
    }
    private fun pipeline(source: String): Node {
        val parts = MarkdownFences.parts(s(source))
        assertTrue(parts.all { it.language == null })
        return parser().parse(MarkdownSource.normalize(parts.single().source))
    }
    private fun containers(root: Node): List<String> = all(root).mapNotNull { node ->
        var depth = 0
        var parent = node.parent
        while (parent != null) {
            if (parent is BlockQuote || parent is ListItem) depth++
            parent = parent.parent
        }
        val label = when (node) {
        is OrderedList -> "ordered:${node.startNumber}:${node.isTight}"
        is BulletList -> "bullet:${node.isTight}"
        is ListItem -> "item"
        is BlockQuote -> "quote"
        else -> null
        }
        label?.let { "$depth:$it" }
    }
    private fun assertOwners(source: String, expected: Int = 1): Node {
        val raw = parser(false).parse(s(source))
        val root = pipeline(source)
        assertEquals(containers(raw), containers(root))
        val blocks = all(root).filterIsInstance<JLatexMathBlock>()
        assertEquals(expected, blocks.size)
        assertTrue(blocks.all { block -> block.parent !is Document })
        return root
    }
    private fun text(root: Node) = all(root).filterIsInstance<Text>().joinToString("") { it.literal }
    private fun literal(source: String, expected: String): Node {
        val root = assertOwners(source, 0)
        assertTrue(text(root), text(root).contains(s(expected)))
        assertFalse(all(root).any { it is JLatexMathNode })
        return root
    }

    @Test fun quoteStandaloneSingleLineBecomesRealDisplayBlock() {
        val root = assertOwners("> before\n> \\[x^2\\]\n> after")
        assertEquals("\nx^2\n", all(root).filterIsInstance<JLatexMathBlock>().single().latex())
        assertEquals("beforeafter", text(root))
    }
    @Test fun tightListKeepsItsItemsAndFollowingParagraph() { assertOwners("- \\[x\\]\n  after\n- next") }
    @Test fun looseListRemainsLoose() { assertOwners("- before\n\n  \\[x\\]\n\n  after\n\n- next") }
    @Test fun orderedStartIsPreserved() { assertOwners("17. \\[x\\]\n18. next") }
    @Test fun dollarDisplayStaysDisplayRatherThanInline() { assertOwners("> §§x§§\n> tail") }
    @Test fun listInsideQuote() { assertOwners("> - \\[x\\]\n>   after\n> - next") }
    @Test fun quoteInsideList() { assertOwners("- > \\[x\\]\n  > after\n- next") }
    @Test fun nestedList() { assertOwners("- outer\n  - \\[x\\]\n    after") }
    @Test fun multipleQuotes() { assertOwners("> > \\[x\\]\n> > after") }
    @Test fun multilineBracketStripsPrefixesThroughRealBlockParser() {
        val root = assertOwners("> \\[\n> a+b\\\\\n> c+d\n> \\]\n> tail".replace("\\\\[", "\\[").replace("\\\\]", "\\]"))
        assertEquals("\na+b\\\\\nc+d\n", all(root).filterIsInstance<JLatexMathBlock>().single().latex())
    }
    @Test fun multilineDollarsKeepListOwnership() { assertOwners("- §§\n  a+b\n  §§\n  tail\n- next") }
    @Test fun inlineDisplayCandidateIsLiteralNotPromoted() { literal("> before \\[a_1*b\\] after", "before \\[a_1*b\\] after") }
    @Test fun unsupportedDollarDisplayIsLiteral() { literal("- before §§a_1*b§§ after\n- next", "before §§a_1*b§§ after") }
    @Test fun literalTexDoesNotCreateLinksEmphasisOrHtml() {
        val root = literal("> pre §§[x](https://example.invalid) *a* <b> \\alpha§§ post", "§§[x](https://example.invalid) *a* <b> \\alpha§§")
        assertFalse(all(root).any { it is Link || it is Emphasis || it is HtmlInline })
    }
    @Test fun lazyQuoteContinuationIsNotPromoted() { literal("> before\n\\[x\\]\nafter", "\\[x\\]") }
    @Test fun lazyMultilinePrefixIsNotInvented() { literal("> \\[\na+b\n> \\]", "a+b") }
    @Test fun tabsDeclinePromotionWithoutLosingFormula() { literal(">\t\\[x\\]", "\\[x\\]") }
    @Test fun overLengthIsLiteral() { literal("> \\[" + "x".repeat(MarkdownContainerMath.MAX_LENGTH) + "\\]", "\\[" + "x".repeat(MarkdownContainerMath.MAX_LENGTH) + "\\]") }
    @Test fun exactSingleLineLengthBoundaryIsAccepted() { assertOwners("> \\[" + "x".repeat(MarkdownContainerMath.MAX_LENGTH - 4) + "\\]") }
    @Test fun tooManyLinesIsLiteral() { literal("> \\[\n" + "> x\n".repeat(MarkdownContainerMath.MAX_LINES) + "> \\]", "x") }
    @Test fun excessDepthIsLiteralWithoutDroppingContainers() { literal("> ".repeat(MarkdownContainerMath.MAX_DEPTH + 1) + "\\[x\\]", "\\[x\\]") }
    @Test fun unclosedDollarsCannotStartUnboundedMathBlock() { literal("> §§x\n> tail", "§§x") }
    @Test fun unclosedBracketIsLiteralInStreamingContainer() {
        val source = "> \\[x\n> tail"
        val preview = MarkdownSource.preview(source, true)
        assertNull(preview.pendingMath)
        assertEquals(containers(parser(false).parse(source)), containers(parser().parse(preview.markdown)))
        assertTrue(text(parser().parse(preview.markdown)).contains("\\[x"))
    }
    @Test fun growingContainerSourceDoesNotExtractPendingMath() {
        val source = "> \\[x^2\\]\n> after"
        for (end in 2..source.length) {
            val prefix = source.take(end)
            val preview = MarkdownSource.preview(prefix, true)
            assertNull(prefix, preview.pendingMath)
            assertEquals(prefix, containers(parser(false).parse(prefix)), containers(parser().parse(preview.markdown)))
        }
        assertEquals(MarkdownSource.normalize(source), MarkdownSource.preview(source, true).markdown)
    }
    @Test fun adjacentContainerCodeStaysOpaque() {
        val source = "> ~~~tex\n> \\[code\\]\n> ~~~\n>\n> \\[x\\]\n> tail"
        val root = assertOwners(source)
        assertEquals("\\[code\\]\n", all(root).filterIsInstance<FencedCodeBlock>().single().literal)
    }
    @Test fun inlineMathStillWorksBesideLiteralDisplay() {
        val root = pipeline("> before \\[x\\] then §y§")
        assertEquals(listOf("y"), all(root).filterIsInstance<JLatexMathNode>().map { it.latex() })
        assertTrue(text(root).contains("\\[x\\]"))
    }
    @Test fun pipeShieldAppliesOnlyToAcceptedMath() {
        val source = "> \\[x|y\\]"
        assertTrue(MarkdownSource.preview(source, false, "TOKEN").markdown.contains("xTOKENy"))
        val fallback = "> before \\[x|y\\]"
        assertFalse(MarkdownSource.preview(fallback, false, "TOKEN").markdown.contains("TOKEN"))
    }
    @Test fun crLfAndCrKeepContainerOwnership() {
        for (eol in listOf("\n", "\r\n", "\r")) assertOwners(("> \\[\n> x\n> \\]\n> after").replace("\n", eol))
    }
    @Test fun rootMathAfterContainerStillUsesExistingPolicy() {
        val root = pipeline("> pre \\[literal\\]\n\n\\[root\\]")
        assertEquals("\nroot\n", all(root).filterIsInstance<JLatexMathBlock>().single().latex())
        assertTrue(text(root).contains("\\[literal\\]"))
    }
    @Test fun differentListItemsCannotShareMathClosers() { literal("- \\[x\n- y\\]", "\\[x") }
    @Test fun exactContainerDepthIsAccepted() { assertOwners("> ".repeat(MarkdownContainerMath.MAX_DEPTH) + "\\[x\\]") }
    @Test fun exactMultilineLineBudgetIsAccepted() { assertOwners("> \\[\n" + "> x\n".repeat(MarkdownContainerMath.MAX_LINES - 2) + "> \\]") }
    @Test fun paddedOrderedMarkerAndMultiDigitContinuation() { assertOwners("  127. \\[x\\]\n       tail\n  128. next") }
    @Test fun nestedLazyListInQuoteCannotBePromoted() { literal("> - before\n> \\[x\\]", "\\[x\\]") }
    @Test fun inlineCodeContainingDisplayRemainsByteOpaque() {
        val source = "> `\\[x\\] §§y§§`"
        assertEquals(s(source), MarkdownSource.normalize(s(source)))
        assertEquals(s("\\[x\\] §§y§§"), all(pipeline(source)).filterIsInstance<Code>().single().literal)
    }
    @Test fun referenceAndEmphasisAfterLiteralFormulaStillParse() {
        val root = pipeline("> pre \\[x_1\\] **bold** [link][r]\n\n[r]: https://example.invalid")
        assertTrue(all(root).any { it is StrongEmphasis })
        assertEquals("https://example.invalid", all(root).filterIsInstance<Link>().single().destination)
    }

    @Test fun internalDollarOnlyBodyCannotClosePromotedBracketBlock() {
        literal("> \\[§§\\]", "\\[§§\\]")
        literal("> \\[\n> §§\n> \\]", "§§")
    }
    @Test fun containerTableDisplayIsLiteralAndKeepsExistingCellBoundaries() {
        val source = "> A | B\n> --- | ---\n> \\[a|b\\] | c"
        val raw = parser(false).parse(source)
        val root = pipeline(source)
        assertFalse(all(root).any { it is JLatexMathBlock || it is JLatexMathNode })
        assertEquals(all(raw).filterIsInstance<org.commonmark.ext.gfm.tables.TableCell>().size,
            all(root).filterIsInstance<org.commonmark.ext.gfm.tables.TableCell>().size)
        assertEquals(containers(raw), containers(root))
    }
    @Test fun displayCandidateCannotTurnHeadingIntoAParagraph() {
        val source = "> \\[\n> # heading\n> \\]"
        val root = pipeline(source)
        assertFalse(all(root).any { it is JLatexMathBlock })
        assertEquals(1, all(root).filterIsInstance<Heading>().size)
    }

    @Test fun lazyTextAfterStandaloneQuoteFormulaCannotEscapeItsOwner() { literal("> \\[x\\]\nlazy after", "\\[x\\]") }
    @Test fun lazyTextAfterStandaloneListFormulaCannotEscapeItsOwner() { literal("- \\[x\\]\nlazy after\n- next", "\\[x\\]") }
    @Test fun mathLookingSetextHeadingCannotBePromotedFromDetachedParagraph() {
        val source = "> \\[x\\]\n> ---\n> cell"
        val root = pipeline(source)
        assertFalse(all(root).any { it is JLatexMathBlock || it is JLatexMathNode })
        assertEquals(1, all(root).filterIsInstance<Heading>().size)
    }

    @Test fun tableLiteralFallbackPreservesPipeEscapeParity() {
        for (slashes in 0..5) {
            val source = "> A | B\n> --- | ---\n> \\[a" + "\\".repeat(slashes) + "|b\\] | after"
            val raw = parser(false).parse(source)
            val root = pipeline(source)
            val rawCells = all(raw).filterIsInstance<org.commonmark.ext.gfm.tables.TableCell>()
            val cells = all(root).filterIsInstance<org.commonmark.ext.gfm.tables.TableCell>()
            assertEquals(rawCells.size, cells.size)
            assertEquals(text(rawCells.last()), text(cells.last()).replace("\\]", "]"))
            assertFalse(all(root).any { it is JLatexMathBlock || it is JLatexMathNode })
        }
    }

}
