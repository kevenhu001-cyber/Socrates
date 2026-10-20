package com.socrates.android.ui

import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.ext.gfm.tables.TableCell
import org.commonmark.node.*
import org.commonmark.parser.Parser
import org.junit.Assert.*
import org.junit.Test

class MarkdownTablesTest {
    private val parser = Parser.builder().extensions(listOf(TablesExtension.create())).build()
    private fun blocks(source: String) = MarkdownTables.blocks(parser.parse(source))
    private fun table(source: String) = blocks(source).filterIsInstance<MarkdownTables.Block.Table>().single()
    private fun nodes(root: Node): List<Node> = buildList {
        fun visit(node: Node) { add(node); var child = node.firstChild; while (child != null) { visit(child); child = child.next } }
        visit(root)
    }
    private fun literal(root: Node) = nodes(root).joinToString("") {
        when (it) { is Text -> it.literal; is Code -> it.literal; else -> "" }
    }
    private fun s(source: String) = source.replace('§', '$')

    @Test fun tableUsesActualHeadersAndRows() {
        val table = table("| 名称 | 数值 |\n| --- | --- |\n| 数据一 | 17 |\n| 数据二 | 42 |")
        assertEquals(listOf(true, false, false), table.rows.map { it.header })
        assertEquals(listOf(listOf("名称", "数值"), listOf("数据一", "17"), listOf("数据二", "42")), table.rows.map { it.cells.map { cell -> literal(cell.node) } })
    }
    @Test fun optionalOuterPipesAreParsedByGfm() {
        assertEquals(listOf("A", "B"), table("A | B\n--- | ---\none | two").rows.first().cells.map { literal(it.node) })
    }
    @Test fun preservesColumnAlignments() {
        assertEquals(listOf(TableCell.Alignment.LEFT, TableCell.Alignment.CENTER, TableCell.Alignment.RIGHT, null),
            table("A|B|C|D\n:---|:---:|---:|---\na|b|c|d").rows.first().cells.map { it.alignment })
    }
    @Test fun absentCellsAreFilledByParser() {
        assertEquals(listOf("one", ""), table("A|B\n---|---\none").rows.last().cells.map { literal(it.node) })
    }
    @Test fun extraCellsFollowGfmAndAreNotNewColumns() {
        assertEquals(listOf("one", "two"), table("A|B\n---|---\none|two|extra").rows.last().cells.map { literal(it.node) })
    }
    @Test fun headerOnlyTableRemainsATable() {
        assertTrue(table("A|B\n---|---").rows.single().header)
    }
    @Test fun existingParserAcceptsSurplusDelimiterColumnsWithoutInventingHeaderCells() {
        val parsed = table("A|B\n---|---|---\none|two")
        assertEquals(listOf("A", "B"), parsed.rows.first().cells.map { literal(it.node) })
        assertTrue(parsed.rows.all { it.cells.size == 2 })
    }
    @Test fun incompleteDelimiterRemainsProse() {
        assertTrue(blocks("A|B\n--x|---").single() is MarkdownTables.Block.Prose)
    }
    @Test fun escapedPipesStayInTheirCells() {
        assertEquals(listOf("a|b", "c"), table("A|B\n---|---\na\\|b|c").rows.last().cells.map { literal(it.node) })
    }
    @Test fun escapedPipesInsideInlineCodeStayCode() {
        val node = table("A|B\n---|---\n`a\\|b`|c").rows.last().cells.first().node
        assertEquals("a|b", nodes(node).filterIsInstance<Code>().single().literal)
    }
    @Test fun multipleTickInlineCodeIsNotReparsedAsMath() {
        val node = table(s("A|B\n---|---\n``a ` §x§``|c")).rows.last().cells.first().node
        assertEquals(s("a ` §x§"), nodes(node).filterIsInstance<Code>().single().literal)
    }
    @Test fun emphasisAndLinksRetainInlineNodes() {
        val row = table("A|B\n---|---\n**bold** *em*|[link](https://example.invalid/path)").rows.last()
        assertTrue(nodes(row.cells.first().node).any { it is StrongEmphasis })
        assertTrue(nodes(row.cells.first().node).any { it is Emphasis })
        assertEquals("https://example.invalid/path", nodes(row.cells.last().node).filterIsInstance<Link>().single().destination)
    }
    @Test fun referencesAfterTableAreResolvedBeforeSplitting() {
        val row = table("A|B\n---|---\n[name][ref]|value\n\n[ref]: https://example.invalid/ref \"title\"").rows.last()
        val link = nodes(row.cells.first().node).filterIsInstance<Link>().single()
        assertEquals("https://example.invalid/ref", link.destination)
        assertEquals("title", link.title)
    }
    @Test fun proseReferencesAcrossTableRemainResolved() {
        val result = blocks("[before][ref]\n\nA|B\n---|---\na|b\n\n[after][ref]\n\n[ref]: https://example.invalid/ref")
        assertEquals(3, result.size)
        val links = result.filterIsInstance<MarkdownTables.Block.Prose>().flatMap { nodes(it.node).filterIsInstance<Link>() }
        assertEquals(2, links.size)
        assertTrue(links.all { it.destination == "https://example.invalid/ref" })
    }
    @Test fun blocksKeepProseAndMultipleTablesInOrder() {
        val result = blocks("before\n\nA|B\n---|---\na|b\n\nbetween\n\nC|D\n---|---\nc|d\n\nafter")
        assertEquals(5, result.size)
        assertEquals(listOf("before", "between", "after"), result.filterIsInstance<MarkdownTables.Block.Prose>().map { literal(it.node) })
    }
    @Test fun emptySourceCreatesNoBlocks() { assertTrue(blocks("").isEmpty()) }
    @Test fun ordinaryParagraphsRemainTogether() {
        val result = blocks("one\n\ntwo\n\nthree")
        assertEquals(1, result.size)
        assertEquals(3, nodes((result.single() as MarkdownTables.Block.Prose).node).filterIsInstance<Paragraph>().size)
    }
    @Test fun nestedQuoteTablesAreNotDetachedFromTheirContainer() {
        val node = (blocks("> A|B\n> ---|---\n> a|b").single() as MarkdownTables.Block.Prose).node
        assertTrue(node.firstChild is BlockQuote)
        assertTrue(nodes(node).any { it is org.commonmark.ext.gfm.tables.TableBlock })
    }
    @Test fun nestedListTablesAreNotDetachedFromTheirContainer() {
        val node = (blocks("- A|B\n  ---|---\n  a|b").single() as MarkdownTables.Block.Prose).node
        assertTrue(node.firstChild is BulletList)
        assertTrue(nodes(node).any { it is org.commonmark.ext.gfm.tables.TableBlock })
    }
    @Test fun fencedAndIndentedCodeNeverBecomeTables() {
        assertTrue(blocks("```\nA|B\n---|---\na|b\n```\n\n    A|B\n    ---|---").all { it is MarkdownTables.Block.Prose })
    }
    @Test fun lineEndingVariantsAreParsedByGfm() {
        listOf("\n", "\r\n", "\r").forEach { eol -> assertEquals(2, table(listOf("A|B", "---|---", "一🙂|二").joinToString(eol)).rows.size) }
    }
    @Test fun mathPipeShieldDoesNotSplitAbsoluteValueCells() {
        val source = s("A|B\n---|---\n§|x|§|value")
        val token = MarkdownTables.pipeToken(source)
        val prepared = MarkdownSource.preview(source, false, token).markdown
        val row = table(prepared).rows.last()
        assertEquals(2, row.cells.size)
        assertEquals(s("§§${token}x${token}§§"), literal(row.cells.first().node))
    }
    @Test fun texBackslashPipesAreNotUnescapedByGfm() {
        val source = "A|B\n---|---\n\\(\\|x\\|\\)|value"
        val token = MarkdownTables.pipeToken(source)
        val prepared = MarkdownSource.preview(source, false, token).markdown
        assertTrue(prepared.contains("\\${token}x\\${token}"))
        assertEquals(2, table(prepared).rows.last().cells.size)
    }
    @Test fun pipeShieldDoesNotTouchCodeEscapesPricesOrOrdinaryPipes() {
        val source = s("`§|x|§` and §5-§10 and a\\|b and c|d")
        assertEquals(MarkdownSource.normalize(source), MarkdownSource.preview(source, false, "SHIELD").markdown)
    }
    @Test fun pipeTokenCannotCollideWithRealMessageContent() {
        assertEquals("SOCRATESMATHPIPEXX", MarkdownTables.pipeToken("SOCRATESMATHPIPE SOCRATESMATHPIPEX"))
    }
    @Test fun pendingMathIsKeptLiteralWithoutShielding() {
        val source = "A|B\n---|---\nvalue|\\(a|b"
        val preview = MarkdownSource.preview(source, true, "SHIELD")
        assertEquals("\\(a|b", preview.pendingMath)
        assertFalse(preview.markdown.contains("SHIELD"))
    }

    @Test fun restoresInlineAndBlockTexNodesWithoutLosingBackslashes() {
        val root = Document()
        val inline = io.noties.markwon.ext.latex.JLatexMathNode().apply { latex("SHIELDxSHIELD+\\SHIELDy\\SHIELD") }
        val block = io.noties.markwon.ext.latex.JLatexMathBlock().apply { latex("\\leftSHIELDx\\rightSHIELD") }
        root.appendChild(inline); root.appendChild(block)
        MarkdownTables.restoreMathPipes(root, "SHIELD")
        assertEquals("|x|+\\|y\\|", inline.latex())
        assertEquals("\\left|x\\right|", block.latex())
    }
    @Test fun restoresLiteralFallbackNodesAfterRejectedMath() {
        val root = Document()
        val text = Text("SHIELDxSHIELD")
        val code = Code("SHIELDxSHIELD")
        val html = HtmlInline().apply { literal = "SHIELDxSHIELD" }
        root.appendChild(text); root.appendChild(code); root.appendChild(html)
        MarkdownTables.restoreMathPipes(root, "SHIELD")
        assertEquals("|x|", text.literal)
        assertEquals("|x|", code.literal)
        assertEquals("|x|", html.literal)
    }
    @Test fun restoresCodeBlockFallbackNodesSoInternalTokensCannotLeak() {
        val root = Document()
        val indented = IndentedCodeBlock().apply { literal = "SHIELDxSHIELD" }
        val fenced = FencedCodeBlock().apply { literal = "SHIELDySHIELD" }
        root.appendChild(indented); root.appendChild(fenced)
        MarkdownTables.restoreMathPipes(root, "SHIELD")
        assertEquals("|x|", indented.literal)
        assertEquals("|y|", fenced.literal)
    }
    @Test fun restoresLinkAndImageDestinationsAndTitles() {
        val root = Document()
        val link = Link("https://example.invalid/SHIELD", "SHIELDtitle")
        val image = Image("https://example.invalid/SHIELD", "SHIELDtitle")
        root.appendChild(link); root.appendChild(image)
        MarkdownTables.restoreMathPipes(root, "SHIELD")
        assertEquals("https://example.invalid/|", link.destination)
        assertEquals("|title", link.title)
        assertEquals("https://example.invalid/|", image.destination)
        assertEquals("|title", image.title)
    }
    @Test fun restoredMathRemainsInsideExistingEmphasisAndTableCells() {
        val source = s("A|B\n---|---\n**§|x|§**|value")
        val token = MarkdownTables.pipeToken(source)
        val root = parser.parse(MarkdownSource.preview(source, false, token).markdown)
        MarkdownTables.restoreMathPipes(root, token)
        val cell = (MarkdownTables.blocks(root).single() as MarkdownTables.Block.Table).rows.last().cells.first()
        assertTrue(nodes(cell.node).any { it is StrongEmphasis })
        assertEquals(s("§§|x|§§"), literal(cell.node))
    }
}
