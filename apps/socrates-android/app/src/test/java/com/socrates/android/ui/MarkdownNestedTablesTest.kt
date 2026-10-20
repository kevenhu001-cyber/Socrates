package com.socrates.android.ui

import io.noties.markwon.ext.latex.JLatexMathNode
import io.noties.markwon.inlineparser.InlineProcessor
import io.noties.markwon.inlineparser.MarkwonInlineParser
import org.commonmark.ext.gfm.tables.TableBlock
import org.commonmark.ext.gfm.tables.TableCell
import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.node.*
import org.commonmark.parser.Parser
import org.junit.Assert.*
import org.junit.Test

/** Nested GFM tables are presented in-place; parsing and inline nodes remain shared with prose. */
class MarkdownNestedTablesTest {
    private fun parser(): Parser {
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

    private fun parse(source: String): Node {
        val normalized = source.replace('§', '$')
        val token = MarkdownTables.pipeToken(normalized)
        return parser().parse(MarkdownSource.preview(normalized, false, token).markdown).also {
            MarkdownTables.restoreMathPipes(it, token)
        }
    }
    private fun all(root: Node): List<Node> = buildList {
        fun visit(n: Node) { add(n); var c = n.firstChild; while (c != null) { visit(c); c = c.next } }
        visit(root)
    }
    private fun text(root: Node): String = all(root).filterIsInstance<Text>().joinToString("") { it.literal }
    private fun table(blocks: List<MarkdownContainers.Block>) = blocks.filterIsInstance<MarkdownContainers.Block.Table>()
    private fun sourceTable() = "A|B\n---|---\na|b"

    @Test fun rootTableIsPromotedAsTableBlock() {
        val block = MarkdownContainers.blocks(parse(sourceTable())).single() as MarkdownContainers.Block.Table
        assertEquals(listOf(true, false), block.rows.map { it.header })
        assertEquals(listOf("A", "B"), block.rows.first().cells.map { text(it.node) })
        assertEquals(listOf("a", "b"), block.rows.last().cells.map { text(it.node) })
    }

    @Test fun quotedTableStaysAtQuoteChildPosition() {
        val quote = MarkdownContainers.blocks(parse("> A|B\n> ---|---\n> a|b")).single() as MarkdownContainers.Block.Quote
        assertEquals(1, table(quote.children).size)
        assertTrue(quote.children.single() is MarkdownContainers.Block.Table)
    }

    @Test fun bulletListTableStaysInItsOwningItem() {
        val list = MarkdownContainers.blocks(parse("- item\n\n  A|B\n  ---|---\n  a|b")).single() as MarkdownContainers.Block.ListBlock
        assertEquals(1, table(list.items.single().children).size)
        assertEquals("item", text((list.items.single().children.first() as MarkdownContainers.Block.Prose).node))
    }

    @Test fun orderedListTableStaysInItsOwningItemAndKeepsOrdinal() {
        val list = MarkdownContainers.blocks(parse("7. item\n\n   A|B\n   ---|---\n   a|b")).single() as MarkdownContainers.Block.ListBlock
        assertEquals(MarkdownContainers.Marker.Ordered(7), list.items.single().marker)
        assertEquals(1, table(list.items.single().children).size)
    }

    @Test fun quoteAndListCanContainNestedTablesWithoutPromotion() {
        val root = parse("> - item\n>\n>   A|B\n>   ---|---\n>   a|b")
        val quote = MarkdownContainers.blocks(root).single() as MarkdownContainers.Block.Quote
        val list = quote.children.single() as MarkdownContainers.Block.ListBlock
        assertEquals(1, table(list.items.single().children).size)
        assertTrue(all(root).none { it is TableBlock })
    }

    @Test fun taskListTableRemainsInsideTaskItem() {
        val root = Document()
        val item = io.noties.markwon.ext.tasklist.TaskListItem(true)
        item.appendChild(Paragraph().also { it.appendChild(Text("done")) })
        val astTable = parser().parse(sourceTable()).firstChild as TableBlock
        item.appendChild(astTable)
        root.appendChild(BulletList().also { it.appendChild(item) })
        val list = MarkdownContainers.blocks(root).single() as MarkdownContainers.Block.ListBlock
        assertEquals(MarkdownContainers.Marker.Task(true), list.items.single().marker)
        assertEquals(1, table(list.items.single().children).size)
    }

    @Test fun proseTablesAndContainersRemainInSourceOrder() {
        val blocks = MarkdownContainers.blocks(parse("before\n\n> quote\n\nA|B\n---|---\na|b\n\nafter"))
        assertEquals(4, blocks.size)
        assertEquals("before", text((blocks[0] as MarkdownContainers.Block.Prose).node))
        assertTrue(blocks[1] is MarkdownContainers.Block.Quote)
        assertTrue(blocks[2] is MarkdownContainers.Block.Table)
        assertEquals("after", text((blocks[3] as MarkdownContainers.Block.Prose).node))
    }

    @Test fun multipleTablesInQuoteRemainOrderedBetweenProse() {
        val quote = MarkdownContainers.blocks(parse("> before\n>\n> A|B\n> ---|---\n> a|b\n>\n> between\n>\n> C|D\n> ---|---\n> c|d\n>\n> after")).single() as MarkdownContainers.Block.Quote
        assertEquals(5, quote.children.size)
        assertEquals("before", text((quote.children[0] as MarkdownContainers.Block.Prose).node))
        assertEquals(listOf("A", "C"), table(quote.children).map { text(it.rows.first().cells.first().node) })
        assertEquals("between", text((quote.children[2] as MarkdownContainers.Block.Prose).node))
        assertEquals("after", text((quote.children[4] as MarkdownContainers.Block.Prose).node))
    }

    @Test fun referenceLinksResolveAcrossNestedTableBoundaries() {
        val root = parse("> [before][ref]\n>\n> A|B\n> ---|---\n> [inside][ref]|v\n>\n> [after][ref]\n\n[ref]: https://example.invalid/shared \"shared\"")
        val links = all(root).filterIsInstance<Link>()
        val quote = MarkdownContainers.blocks(root).single() as MarkdownContainers.Block.Quote
        assertEquals(3, links.size)
        assertTrue(links.all { it.destination == "https://example.invalid/shared" && it.title == "shared" })
        assertSame(links[1], all(table(quote.children).single().rows.last().cells.first().node).filterIsInstance<Link>().single())
    }

    @Test fun extractedCellsRetainEmphasisCodeMathAndOriginalInlineIdentity() {
        val root = parse("A|B\n---|---\n**bold** `code` §x_i§|value")
        val originalStrong = all(root).filterIsInstance<StrongEmphasis>().single()
        val originalCode = all(root).filterIsInstance<Code>().single()
        val originalMath = all(root).filterIsInstance<JLatexMathNode>().single()
        val table = table(MarkdownContainers.blocks(root)).single()
        val nodes = all(table.rows.last().cells.first().node)
        assertSame(originalStrong, nodes.filterIsInstance<StrongEmphasis>().single())
        assertSame(originalCode, nodes.filterIsInstance<Code>().single())
        assertSame(originalMath, nodes.filterIsInstance<JLatexMathNode>().single())
        assertEquals("x_i", originalMath.latex())
    }

    @Test fun mathPipeShieldIsRestoredInsideExtractedNestedCell() {
        val root = parse("> A|B\n> ---|---\n> §|x|§|value")
        val quote = MarkdownContainers.blocks(root).single() as MarkdownContainers.Block.Quote
        val cell = table(quote.children).single().rows.last().cells.first().node
        assertEquals("|x|", all(cell).filterIsInstance<JLatexMathNode>().single().latex())
    }

    @Test fun cellMathLengthBudgetStillAppliesAfterNestedExtraction() {
        val body = "x".repeat(MarkdownTableMath.MAX_MATH_LENGTH + 1)
        val root = parse("> A|B\n> ---|---\n> \\($body\\)|value")
        val quote = MarkdownContainers.blocks(root).single() as MarkdownContainers.Block.Quote
        val cell = table(quote.children).single().rows.last().cells.first().node
        assertTrue(all(cell).filterIsInstance<JLatexMathNode>().isEmpty())
        assertTrue(text(cell).contains(body))
    }

    @Test fun cellMathCountBudgetStillAppliesAfterNestedExtraction() {
        val formulas = List(MarkdownTableMath.MAX_MATH_PER_CELL + 2) { "§x§" }.joinToString(" ")
        val root = parse("> A|B\n> ---|---\n> $formulas|value")
        val quote = MarkdownContainers.blocks(root).single() as MarkdownContainers.Block.Quote
        val cell = table(quote.children).single().rows.last().cells.first().node
        assertEquals(MarkdownTableMath.MAX_MATH_PER_CELL, all(cell).filterIsInstance<JLatexMathNode>().size)
        assertEquals(2, Regex(Regex.escape("§§x§§".replace('§', '$'))).findAll(text(cell)).count())
    }

    @Test fun mixedNestedTableAndContainerHierarchyIsPreserved() {
        val root = parse("> - outer\n>   > A|B\n>   > ---|---\n>   > a|b")
        val quote = MarkdownContainers.blocks(root).single() as MarkdownContainers.Block.Quote
        val list = quote.children.single() as MarkdownContainers.Block.ListBlock
        val innerQuote = list.items.single().children.filterIsInstance<MarkdownContainers.Block.Quote>().single()
        assertEquals(1, table(innerQuote.children).size)
    }

    @Test fun parsedTableWithResolvedInlineLinksKeepsIdentityWhenInList() {
        val root = parse("- [label](https://example.invalid)\n\n  A|B\n  ---|---\n  [cell](https://example.invalid/cell)|v")
        val originals = all(root).filterIsInstance<Link>()
        val list = MarkdownContainers.blocks(root).single() as MarkdownContainers.Block.ListBlock
        val extracted = table(list.items.single().children).single()
        assertSame(originals.last(), all(extracted.rows.last().cells.first().node).filterIsInstance<Link>().single())
        assertEquals("https://example.invalid/cell", originals.last().destination)
    }

    @Test fun depthBoundaryAllowsTableAtLastPresentedContainerDepth() {
        val root = Document()
        var parent: Node = root
        repeat(MarkdownContainers.MAX_PRESENTATION_DEPTH - 1) { val quote = BlockQuote(); parent.appendChild(quote); parent = quote }
        parent.appendChild(parser().parse(sourceTable()).firstChild)
        var blocks = MarkdownContainers.blocks(root)
        repeat(MarkdownContainers.MAX_PRESENTATION_DEPTH - 1) { blocks = (blocks.single() as MarkdownContainers.Block.Quote).children }
        assertTrue(blocks.single() is MarkdownContainers.Block.Table)
    }

    @Test fun tableAtOrBelowDepthLimitFallsBackWholeAsProse() {
        val root = Document()
        var parent: Node = root
        repeat(MarkdownContainers.MAX_PRESENTATION_DEPTH) { val quote = BlockQuote(); parent.appendChild(quote); parent = quote }
        val original = parser().parse(sourceTable()).firstChild as TableBlock
        parent.appendChild(original)
        var blocks = MarkdownContainers.blocks(root)
        repeat(MarkdownContainers.MAX_PRESENTATION_DEPTH) { blocks = (blocks.single() as MarkdownContainers.Block.Quote).children }
        val fallback = blocks.single() as MarkdownContainers.Block.Prose
        assertSame(original, fallback.node.firstChild)
        assertTrue(all(fallback.node).any { it is TableBlock })
    }

    @Test fun unknownListExpansionContainingTableKeepsWholeOriginalFallback() {
        val extension = object : CustomBlock() {}
        val list = BulletList()
        list.appendChild(extension.also { it.appendChild(parser().parse(sourceTable()).firstChild) })
        val result = MarkdownContainers.blocks(Document().also { it.appendChild(list) }).single() as MarkdownContainers.Block.Prose
        assertSame(list, result.node.firstChild)
        assertTrue(all(result.node).any { it is TableBlock })
    }

    @Test fun unsupportedChildInsideHandBuiltTableIsNotPartiallyExtracted() {
        val table = TableBlock()
        val unknown = object : CustomBlock() {}
        table.appendChild(unknown)
        val result = MarkdownTables.extractOrNull(table)
        assertNull(result)
        assertNull(table.parent)
    }

    @Test fun cancellationCheckpointPropagatesDuringNestedTraversal() {
        val root = parse("> - one\n>   A|B\n>   ---|---\n>   a|b")
        var calls = 0
        try {
            MarkdownContainers.blocks(root) { if (++calls == 4) throw java.util.concurrent.CancellationException("stop") }
            fail("expected cancellation")
        } catch (_: java.util.concurrent.CancellationException) {
            assertEquals(4, calls)
        }
    }

    @Test fun nestedTableExtractionChecksCheckpointForRowsAndCells() {
        val root = parse("> A|B\n> ---|---\n> a|b\n> c|d")
        var calls = 0
        try {
            MarkdownContainers.blocks(root) { if (++calls == 8) throw java.util.concurrent.CancellationException() }
            fail("expected cancellation during extraction")
        } catch (_: java.util.concurrent.CancellationException) {
            assertEquals(8, calls)
        }
    }

    @Test fun streamedFencePartsDoNotFabricateTableStructureFromPartialProse() {
        val source = "before\n\n```kotlin\nval x = 1\n```\n\nA|B\n---|---\na|"
        val parts = MarkdownFences.parts(source)
        assertTrue(parts.any { it.language == "kotlin" && it.source.contains("val x") })
        val prose = parts.filter { it.language == null }.joinToString("") { it.source }
        val preview = MarkdownSource.preview(prose, true, MarkdownTables.pipeToken(prose))
        assertEquals(prose, preview.markdown)
        assertNull(preview.pendingMath)
    }

    @Test fun unknownSectionAfterValidRowsLeavesAllInlineNodesUntouched() {
        val root = parser().parse(sourceTable())
        val original = root.firstChild as TableBlock
        val nodes = all(original)
        val unknown = object : CustomBlock() {}
        original.appendChild(unknown)
        val fallback = MarkdownContainers.blocks(root).single() as MarkdownContainers.Block.Prose
        assertSame(original, fallback.node.firstChild)
        assertSame(unknown, original.lastChild)
        assertEquals(nodes + unknown, all(original))
    }

    @Test fun unknownCellAfterValidCellDoesNotPartiallyConsumeEarlierCell() {
        val original = parser().parse(sourceTable()).firstChild as TableBlock
        val row = original.firstChild.firstChild
        val first = row.firstChild as TableCell
        val inline = first.firstChild
        // TableRow is not a Block; use a valid Node child that is not a TableCell.
        val unknown = Text("unexpected row child")
        row.appendChild(unknown)
        assertNull(MarkdownTables.extractOrNull(original))
        assertSame(inline, first.firstChild)
        assertEquals("A", text(first))
        assertSame(unknown, row.lastChild)
    }

    @Test fun nestedCellsPreserveAlignmentEmptyCellsAndEscapedPipeCode() {
        val quote = MarkdownContainers.blocks(parse("> A|B|C\n> :---|:---:|---:\n> `a\\|b`|center|")).single() as MarkdownContainers.Block.Quote
        val rows = table(quote.children).single().rows
        assertEquals(listOf(TableCell.Alignment.LEFT, TableCell.Alignment.CENTER, TableCell.Alignment.RIGHT), rows.last().cells.map { it.alignment })
        assertEquals("a|b", all(rows.last().cells.first().node).filterIsInstance<Code>().single().literal)
        assertEquals("", text(rows.last().cells.last().node))
    }

    @Test fun nextCellAndNextTableHaveIndependentMathCountBudgets() {
        val formulas = List(MarkdownTableMath.MAX_MATH_PER_CELL + 1) { "§x§" }.joinToString(" ")
        val quote = MarkdownContainers.blocks(parse("> A|B\n> ---|---\n> $formulas|§y§\n>\n> C|D\n> ---|---\n> §z§|§w§")).single() as MarkdownContainers.Block.Quote
        val tables = table(quote.children)
        assertEquals(MarkdownTableMath.MAX_MATH_PER_CELL, all(tables[0].rows.last().cells.first().node).filterIsInstance<JLatexMathNode>().size)
        assertEquals("y", all(tables[0].rows.last().cells.last().node).filterIsInstance<JLatexMathNode>().single().latex())
        assertEquals(listOf("z", "w"), tables[1].rows.last().cells.map { all(it.node).filterIsInstance<JLatexMathNode>().single().latex() })
    }

    @Test fun productionFencePipelineRetainsNestedTableAndLaterRootCodePanel() {
        val source = "> - A|B\n>   ---|---\n>   \\(|x|\\)|value\n\n```text\nA|B\n---|---\n```"
        val parts = MarkdownFences.parts(source)
        assertEquals(listOf(null, "text"), parts.map { it.language })
        val token = MarkdownTables.pipeToken(parts.first().source)
        val prepared = MarkdownSource.preview(parts.first().source, true, token)
        val root = parser().parse(prepared.markdown)
        MarkdownTables.restoreMathPipes(root, token)
        val quote = MarkdownContainers.blocks(root).single() as MarkdownContainers.Block.Quote
        val list = quote.children.single() as MarkdownContainers.Block.ListBlock
        val cell = table(list.items.single().children).single().rows.last().cells.first().node
        assertEquals("|x|", all(cell).filterIsInstance<JLatexMathNode>().single().latex())
        assertEquals("A|B\n---|---\n", parts.last().source)
        assertNull(prepared.pendingMath)
    }
}
