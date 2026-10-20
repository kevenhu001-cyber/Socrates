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

/** Tests raw-source isolation and the real production ordering, not only AST presentation. */
class MarkdownCodeRegionsTest {
    private fun s(value: String) = value.replace('§', '$')
    private fun parser(math: Boolean = false): Parser {
        val builder = Parser.builder().extensions(listOf(TablesExtension.create()))
        if (math) {
            val fallback = Class.forName("io.noties.markwon.ext.latex.JLatexMathInlineProcessor")
                .getDeclaredConstructor().apply { isAccessible = true }.newInstance() as InlineProcessor
            val blocks = Class.forName("io.noties.markwon.ext.latex.JLatexMathBlockParser${'$'}Factory")
                .getDeclaredConstructor().newInstance() as BlockParserFactory
            builder.customBlockParserFactory(blocks)
                .inlineParserFactory(MarkwonInlineParser.factoryBuilder()
                    .addInlineProcessor(MarkdownTableMath()).addInlineProcessor(MarkdownProseMath())
                    .addInlineProcessor(fallback).build())
        }
        return builder.build()
    }
    private fun all(root: Node): List<Node> = buildList {
        fun visit(node: Node) { add(node); var child = node.firstChild; while (child != null) { visit(child); child = child.next } }
        visit(root)
    }
    private fun code(root: Node): List<String> = all(root).mapNotNull { when (it) {
        is FencedCodeBlock -> it.literal
        is IndentedCodeBlock -> it.literal
        else -> null
    } }
    private fun pipeline(source: String): Node {
        val part = MarkdownFences.parts(s(source)).single()
        assertNull("container/indented code must not be promoted to a root panel", part.language)
        return parser(true).parse(MarkdownSource.normalize(part.source))
    }
    private fun assertCodePreserved(source: String) {
        val raw = s(source)
        val result = pipeline(source)
        assertEquals(code(parser().parse(raw)), code(result))
        assertTrue(all(result).none { it is JLatexMathNode })
        assertEquals(raw, MarkdownSource.normalize(raw))
        assertNull(MarkdownSource.preview(raw, true).pendingMath)
    }

    @Test fun quoteFenceProtectsEveryMathDelimiterAndPipe() {
        assertCodePreserved("> ```tex\n> §x§ §§y§§ \\(z\\) \\[w\\] | \\|  \n> ```")
    }
    @Test fun listFenceCloserIsNotMistakenForANewRootPanel() {
        assertCodePreserved("- ```tex\n  §x§ \\[y\\]\n  ```")
    }
    @Test fun orderedListFenceIsOpaque() {
        assertCodePreserved("17. ~~~~tex\n    §x§ \\(y\\)\n    ~~~~~")
    }
    @Test fun quoteInsideListAndListInsideQuoteKeepCodeInTheirContainers() {
        assertCodePreserved("- > ```tex\n  > §x§\n  > ```\n\n> - ~~~tex\n>   \\[z\\]\n>   ~~~")
    }
    @Test fun rootIndentedCodeIsOpaque() {
        assertCodePreserved("    §x§ \\(y\\) \\[z\\]\n    §§a|b§§")
    }
    @Test fun listIndentedCodeIsOpaque() {
        assertCodePreserved("- item\n\n      §x§ \\(y\\) \\[z\\]")
    }
    @Test fun quotedIndentedCodeIsOpaque() {
        assertCodePreserved(">     §x§ \\(y\\) \\[z\\]\n>     §§a§§")
    }
    @Test fun tabsAndMixedContainerIndentationFollowCommonMark() {
        assertCodePreserved(">\t    §x§ \\[y\\]\n\n- item\n\n\t\t§z§")
    }
    @Test fun unclosedContainerFenceIsOpaqueThroughEof() {
        assertCodePreserved("> ~~~tex\n> \\[unfinished §x§")
    }
    @Test fun firstLineEmptyAndCodeAtEofAreRecorded() {
        assertCodePreserved("\n\n> ```tex\n> §x§")
    }
    @Test fun emptyAndWhitespaceInputsHaveNoFalseCode() {
        listOf("", "\n", "\r\n", "  \n\t\n").forEach { source ->
            assertTrue(MarkdownCodeRegions.analyze(source).rootFenceStarts.isEmpty())
            assertEquals(source, MarkdownSource.normalize(source))
        }
    }
    @Test fun sourceRangesUseOriginalCrLfCrAndUnicodeOffsets() {
        for (eol in listOf("\n", "\r\n", "\r")) {
            val source = s("中文🙂$eol$eol> ~~~tex$eol> §x§  $eol> ~~~$eol")
            val analysis = MarkdownCodeRegions.analyze(source)
            assertEquals(listOf(MarkdownCodeRegions.Region(source.indexOf('>'), source.length)), analysis.code)
            assertCodePreserved(source)
        }
    }
    @Test fun nulPreparationCannotShiftOrRewriteRawCode() {
        val source = s("> ~~~\n> \u0000 §x§ 🙂\n> ~~~")
        assertEquals(source, MarkdownSource.normalize(source))
        assertEquals(code(parser().parse(source)), code(pipeline(source)))
    }
    @Test fun literalFenceInsideIndentedCodeDoesNotCreateAPanel() {
        assertCodePreserved("    ~~~tex\n    §x§\n    ~~~")
    }
    @Test fun laterRootFenceStillGetsTheExistingVerbatimPanel() {
        val source = s("- ```tex\n  §x§\n  ```\n\n~~~kt\nval x = \"§y§\"  \r\n~~~\ntail \\(z\\)")
        val parts = MarkdownFences.parts(source)
        assertEquals(3, parts.size)
        assertNull(parts[0].language)
        assertEquals("kt", parts[1].language)
        assertEquals(s("val x = \"§y§\"  \r\n"), parts[1].source)
        assertEquals(s("tail §§z§§"), MarkdownSource.normalize(parts[2].source))
    }
    @Test fun rawClosingFenceInListCannotSwallowFollowingProseMath() {
        val source = s("- ```\n  code\n  ```\n\noutside §y§")
        assertEquals(s("- ```\n  code\n  ```\n\noutside §§y§§"), MarkdownSource.normalize(source))
        val root = pipeline(source)
        assertEquals(1, all(root).filterIsInstance<BulletList>().size)
        assertEquals("y", all(root).filterIsInstance<JLatexMathNode>().single().latex())
    }
    @Test fun missingQuotePrefixEndsCodeWithoutProtectingNextProse() {
        val source = s("> ~~~\n> §x§\noutside §y§")
        val result = MarkdownSource.normalize(source)
        assertEquals(s("> ~~~\n> §x§\noutside §§y§§"), result)
        assertEquals(code(parser().parse(source)), code(parser(true).parse(result)))
    }
    @Test fun indentedCodeDedentRestoresNormalInlineMath() {
        val source = s("    §x§\n\n§y§")
        assertEquals(s("    §x§\n\n§§y§§"), MarkdownSource.normalize(source))
    }
    @Test fun paragraphContinuationIndentIsNotAnIndentedCodeBlock() {
        val source = s("text\n    §x§")
        assertEquals(s("text\n    §§x§§"), MarkdownSource.normalize(source))
    }
    @Test fun quoteLazyContinuationIsStillOrdinaryMathProse() {
        val source = s("> text\nlazy §x§")
        assertEquals(s("> text\nlazy §§x§§"), MarkdownSource.normalize(source))
    }
    @Test fun explicitMathCannotBorrowCloserFromFencedCode() {
        val source = "before \\(x\n\n> ~~~\n> \\)\n> ~~~\n\nafter"
        assertEquals(source, MarkdownSource.normalize(source))
        val result = MarkdownSource.preview(source, true)
        assertEquals(source, result.markdown)
        assertNull(result.pendingMath)
    }
    @Test fun backtickSpanCannotBorrowCloserFromBlockCode() {
        val source = s("`before §x§\n\n> ~~~\n> `\n> ~~~")
        assertEquals(s("`before §§x§§\n\n> ~~~\n> `\n> ~~~"), MarkdownSource.normalize(source))
    }
    @Test fun finalPendingMathAfterContainerCodeRemainsSeparate() {
        val source = "> ~~~\n> \\[inside\n> ~~~\n\noutside \\(tail"
        val result = MarkdownSource.preview(source, true)
        assertEquals("> ~~~\n> \\[inside\n> ~~~\n\noutside ", result.markdown)
        assertEquals("\\(tail", result.pendingMath)
    }
    @Test fun pipeShieldNeverChangesActualCodeBytes() {
        val source = s("> ~~~\n> §x|y§ \\(z|w\\)\n> ~~~\n\noutside §a|b§")
        val result = MarkdownSource.preview(source, false, "TOKEN").markdown
        assertEquals(s("> ~~~\n> §x|y§ \\(z|w\\)\n> ~~~\n\noutside §§aTOKENb§§"), result)
    }
    @Test fun growingUnclosedFencePrefixesNeverCreatePendingMath() {
        val source = "> ~~~tex\n> \\[x_i §y§"
        for (length in source.indexOf('\n') + 1..source.length) {
            val prefix = s(source.take(length))
            val result = MarkdownSource.preview(prefix, true)
            assertEquals(prefix, result.markdown)
            assertNull(result.pendingMath)
        }
    }
    @Test fun actualRootFencesOnlyAreReportedAsPanelStarts() {
        val source = "- ```\n  code\n  ```\n\n> ~~~\n> code\n> ~~~\n\n~~~\nroot\n~~~"
        assertEquals(setOf(source.indexOf("~~~\nroot")), MarkdownCodeRegions.analyze(source).rootFenceStarts)
    }

    @Test fun trailingTabCloserAgreesWithActualCommonMarkDependency() {
        val source = "```\ncode\n```\t\nstill prose\n"
        val parsed = parser().parse(source)
        val part = MarkdownFences.parts(source)
        assertEquals("code\n", code(parsed).single())
        assertEquals(code(parsed).single(), part.first().source)
        assertEquals("still prose\n", part.last().source)
        assertCodePreserved("> ~~~\n> §x§\n> ~~~\t\n")
    }

    @Test fun containerFenceLengthsAndRelativeIndentFollowActualParser() {
        for (marker in listOf('`', '~')) for (length in 3..6) for (indent in 0..3) {
            val fence = marker.toString().repeat(length)
            val spaces = " ".repeat(indent)
            assertCodePreserved("> $spaces${fence}tex\n> $spaces§x§ \\[z\\]\n> $spaces$fence")
        }
    }

    @Test fun existingExplicitMultilineMathWithoutCodeBlocksIsUnchanged() {
        val source = "\\[\n    \\begin{aligned}\n    a&=b\\\\\n    c&=d\n    \\end{aligned}\n\\]"
        assertTrue(MarkdownCodeRegions.analyze(source).code.isEmpty())
        val normalized = MarkdownSource.normalize(source)
        assertEquals(s("\n\n§§\n\\begin{aligned}\n    a&=b\\\\\n    c&=d\n    \\end{aligned}\n§§\n\n"), normalized)
        val block = all(parser(true).parse(normalized)).filterIsInstance<JLatexMathBlock>().single()
        assertTrue(block.latex().contains("\\begin{aligned}"))
        assertTrue(block.latex().contains("a&=b\\\\"))
    }

    @Test fun delimiterPairCrossingAnActualIndentedBlockRemainsLiteral() {
        // A blank line makes this a real CommonMark code block, not math continuation.
        // Code-first preprocessing conservatively declines the cross-block candidate.
        val source = "\\[\n\n    x + y\n\n\\]"
        assertEquals(listOf("x + y\n"), code(parser().parse(source)))
        assertEquals(source, MarkdownSource.normalize(source))
    }
}
