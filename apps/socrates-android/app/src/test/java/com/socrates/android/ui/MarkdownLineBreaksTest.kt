package com.socrates.android.ui

import io.noties.markwon.MarkwonConfiguration
import io.noties.markwon.MarkwonVisitor
import io.noties.markwon.RenderProps
import io.noties.markwon.SoftBreakAddsNewLinePlugin
import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.node.*
import org.commonmark.parser.Parser
import org.junit.Assert.*
import org.junit.Test
import java.lang.reflect.Proxy

/** JVM checks the actual dependency's visitor registration and production preprocessing/AST.
 * TextView output and production plugin wiring are covered by AndroidTest source, not executed here.
 */
class MarkdownLineBreaksTest {
    private val parser = Parser.builder().extensions(listOf(TablesExtension.create())).build()

    private fun parse(source: String, streaming: Boolean = false): Node =
        parser.parse(MarkdownSource.preview(source, streaming).markdown)

    private fun nodes(root: Node): List<Node> = buildList {
        fun visit(node: Node) {
            add(node)
            var child = node.firstChild
            while (child != null) { visit(child); child = child.next }
        }
        visit(root)
    }

    @Test fun dependencyRegistersOnlyASoftBreakVisitorAndRequestsANewline() {
        val visitors = mutableMapOf<Class<*>, MarkwonVisitor.NodeVisitor<*>>()
        val builder = object : MarkwonVisitor.Builder {
            override fun <N : Node> on(type: Class<N>, visitor: MarkwonVisitor.NodeVisitor<in N>?): MarkwonVisitor.Builder {
                visitors[type] = requireNotNull(visitor)
                return this
            }
            override fun blockHandler(handler: MarkwonVisitor.BlockHandler): MarkwonVisitor.Builder =
                error("soft-break plugin must not change block handling")
            override fun build(configuration: MarkwonConfiguration, props: RenderProps): MarkwonVisitor =
                error("registration only")
        }
        SoftBreakAddsNewLinePlugin.create().configureVisitor(builder)
        assertEquals(setOf(SoftLineBreak::class.java), visitors.keys)
        val calls = mutableListOf<String>()
        val visitor = Proxy.newProxyInstance(MarkwonVisitor::class.java.classLoader,
            arrayOf(MarkwonVisitor::class.java)) { _, method, _ ->
            calls += method.name
            assertEquals("ensureNewLine", method.name)
            null
        } as MarkwonVisitor
        @Suppress("UNCHECKED_CAST")
        val softBreak = visitors.getValue(SoftLineBreak::class.java) as MarkwonVisitor.NodeVisitor<SoftLineBreak>
        softBreak.visit(visitor, SoftLineBreak())
        assertEquals(listOf("ensureNewLine"), calls)
    }

    @Test fun plainAndUnicodeSingleNewlinesRemainRealSoftBreaks() {
        listOf("first\nsecond", "中文🙂\n第二行", "first\r\nsecond", "first\rsecond").forEach {
            assertEquals(it, 1, nodes(parse(it)).filterIsInstance<SoftLineBreak>().size)
        }
    }

    @Test fun streamingAndSettledProseHaveTheSameBreakNodes() {
        val source = "first\n**second**\n[third](https://example.invalid)"
        listOf(false, true).forEach {
            val nodes = nodes(parse(source, it))
            assertEquals(2, nodes.filterIsInstance<SoftLineBreak>().size)
            assertEquals(1, nodes.filterIsInstance<StrongEmphasis>().size)
            assertEquals(1, nodes.filterIsInstance<Link>().size)
        }
    }

    @Test fun explicitHardBreaksRemainHardAndAreNotDuplicated() {
        listOf("first  \nsecond", "first\\\nsecond").forEach {
            val nodes = nodes(parse(it))
            assertEquals(1, nodes.filterIsInstance<HardLineBreak>().size)
            assertTrue(nodes.none { it is SoftLineBreak })
        }
    }

    @Test fun blankLinesStayParagraphBoundariesNotSoftBreaks() {
        val nodes = nodes(parse("first\n\nsecond"))
        assertEquals(2, nodes.filterIsInstance<Paragraph>().size)
        assertTrue(nodes.none { it is SoftLineBreak })
    }

    @Test fun trailingNewlineDoesNotCreateAnExtraBreak() {
        val nodes = nodes(parse("first\nsecond\n"))
        assertEquals(1, nodes.filterIsInstance<SoftLineBreak>().size)
        assertTrue(nodes.filterIsInstance<Paragraph>().single().lastChild is Text)
    }

    @Test fun listAndQuoteKeepTheOriginalBreakNodesAtTheirOwningPosition() {
        val root = parse("> - first\n>   second\n>   third\n> - next")
        val original = nodes(root).filterIsInstance<SoftLineBreak>()
        assertEquals(2, original.size)
        val quote = MarkdownContainers.blocks(root).single() as MarkdownContainers.Block.Quote
        val list = quote.children.single() as MarkdownContainers.Block.ListBlock
        val prose = list.items.first().children.single() as MarkdownContainers.Block.Prose
        val moved = nodes(prose.node).filterIsInstance<SoftLineBreak>()
        original.zip(moved).forEach { (before, after) -> assertSame(before, after) }
        assertEquals(2, moved.size)
        assertEquals(2, list.items.size)
    }

    @Test fun inlineCodeNewlineStaysCommonMarkSpaceNotASoftBreak() {
        val nodes = nodes(parse("`first\nsecond`\nthird"))
        assertEquals("first second", nodes.filterIsInstance<Code>().single().literal)
        assertEquals(1, nodes.filterIsInstance<SoftLineBreak>().size)
    }

    @Test fun nestedFencedAndIndentedCodeLiteralsKeepTheirNewlines() {
        listOf("> ```txt\n> first\n> second\n> ```", "- item\n\n      first\n      second").forEach {
            val nodes = nodes(parse(it))
            assertTrue(nodes.none { it is SoftLineBreak })
            val literal = nodes.filterIsInstance<FencedCodeBlock>().singleOrNull()?.literal
                ?: nodes.filterIsInstance<IndentedCodeBlock>().single().literal
            assertEquals("first\nsecond\n", literal)
        }
    }

    @Test fun rootCodePanelSourceAndCopyWhitespaceAreUntouched() {
        val source = "before\nline\n\n```txt\r\n  first  \r\n\r\n```\r\nafter\nline"
        val parts = MarkdownFences.parts(source)
        assertEquals("  first  \r\n\r\n", parts.single { it.language != null }.source)
        parts.filter { it.language == null }.forEach {
            assertEquals(1, nodes(parse(it.source)).filterIsInstance<SoftLineBreak>().size)
        }
    }

    @Test fun gfmRowsDoNotBecomeSoftBreaksInsideCells() {
        val root = parse("A|B\n---|---\nfirst|second\nthird|fourth")
        assertTrue(nodes(root).none { it is SoftLineBreak })
        val table = MarkdownContainers.blocks(root).single() as MarkdownContainers.Block.Table
        assertEquals(3, table.rows.size)
        assertEquals(2, table.rows.first().cells.size)
    }

    @Test fun depthFallbackRetainsBreaksWithoutRewritingTheSubtree() {
        val root = parse("> ".repeat(14) + "first\n" + "> ".repeat(14) + "second")
        val original = nodes(root).filterIsInstance<SoftLineBreak>().single()
        fun prose(blocks: List<MarkdownContainers.Block>): List<Node> = blocks.flatMap {
            when (it) {
                is MarkdownContainers.Block.Prose -> nodes(it.node)
                is MarkdownContainers.Block.Quote -> prose(it.children)
                is MarkdownContainers.Block.ListBlock -> it.items.flatMap { item -> prose(item.children) }
                is MarkdownContainers.Block.Table -> emptyList()
            }
        }
        assertSame(original, prose(MarkdownContainers.blocks(root)).filterIsInstance<SoftLineBreak>().single())
    }
}
