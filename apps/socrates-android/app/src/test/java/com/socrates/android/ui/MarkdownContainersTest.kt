package com.socrates.android.ui

import io.noties.markwon.ext.latex.JLatexMathNode
import io.noties.markwon.inlineparser.InlineProcessor
import io.noties.markwon.inlineparser.MarkwonInlineParser
import org.commonmark.ext.gfm.tables.TableBlock
import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.node.*
import org.commonmark.parser.Parser
import org.junit.Assert.*
import org.junit.Test

/** Exercises presentation blocks from real, already-parsed CommonMark/Markwon ASTs. */
class MarkdownContainersTest {
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

    private fun parse(source: String): Node = parser().parse(MarkdownSource.normalize(source.replace('§', '$')))
    private fun all(root: Node): List<Node> = buildList {
        fun visit(n: Node) { add(n); var c = n.firstChild; while (c != null) { visit(c); c = c.next } }
        visit(root)
    }
    private fun text(root: Node): String = all(root).filterIsInstance<Text>().joinToString("") { it.literal }
    @Test fun mixedNestedListsRetainHierarchyAndMarkers() {
        val result = MarkdownContainers.blocks(parse("""1. first
   - child
     1. grandchild
2. second"""))
        val top = result.single() as MarkdownContainers.Block.ListBlock
        assertEquals(2, top.items.size)
        assertEquals(MarkdownContainers.Marker.Ordered(1), top.items[0].marker)
        val nested = top.items[0].children.filterIsInstance<MarkdownContainers.Block.ListBlock>().single()
        assertEquals(MarkdownContainers.Marker.Bullet, nested.items.single().marker)
        val deep = nested.items.single().children.filterIsInstance<MarkdownContainers.Block.ListBlock>().single()
        assertEquals(MarkdownContainers.Marker.Ordered(1), deep.items.single().marker)
        assertEquals(MarkdownContainers.Marker.Ordered(2), top.items[1].marker)
    }

    @Test fun orderedStartIsHonoredAndLaterSourceNumbersDoNotResetOrdinal() {
        val list = MarkdownContainers.blocks(parse("""7. seven
42. eight
3. nine""")).single() as MarkdownContainers.Block.ListBlock
        assertEquals(listOf(7L, 8L, 9L), list.items.map { (it.marker as MarkdownContainers.Marker.Ordered).number })
    }

    @Test fun unorderedListUsesBulletMarkers() {
        val list = MarkdownContainers.blocks(parse("- alpha\n- beta")).single() as MarkdownContainers.Block.ListBlock
        assertEquals(listOf(MarkdownContainers.Marker.Bullet, MarkdownContainers.Marker.Bullet), list.items.map { it.marker })
    }

    @Test fun tightAndLooseListsExposeParserTightness() {
        val tight = MarkdownContainers.blocks(parse("- one\n- two")).single() as MarkdownContainers.Block.ListBlock
        val loose = MarkdownContainers.blocks(parse("- one\n\n- two")).single() as MarkdownContainers.Block.ListBlock
        assertTrue(tight.tight)
        assertFalse(loose.tight)
    }

    @Test fun multipleParagraphsInLooseItemKeepTheirOriginalParagraphNodes() {
        val list = MarkdownContainers.blocks(parse("- first paragraph\n\n  second paragraph")).single() as MarkdownContainers.Block.ListBlock
        assertFalse(list.tight)
        val prose = list.items.single().children.single() as MarkdownContainers.Block.Prose
        assertEquals(listOf("first paragraph", "second paragraph"), all(prose.node).filterIsInstance<Paragraph>().map(::text))
    }

    @Test fun continuationLinesRemainInTheirOwningParagraph() {
        val list = MarkdownContainers.blocks(parse("- first line\n  continued\n  still continued")).single() as MarkdownContainers.Block.ListBlock
        val content = list.items.single().children.single() as MarkdownContainers.Block.Prose
        assertEquals("first linecontinuedstill continued", text(content.node))
    }

    @Test fun lazyQuoteContinuationIsKeptInsideQuote() {
        val quote = MarkdownContainers.blocks(parse("> quoted first\nlazy continuation")).single() as MarkdownContainers.Block.Quote
        assertEquals("quoted firstlazy continuation", text((quote.children.single() as MarkdownContainers.Block.Prose).node))
    }

    @Test fun nestedQuotesRemainNested() {
        val outer = MarkdownContainers.blocks(parse("> outer\n>\n> > inner")).single() as MarkdownContainers.Block.Quote
        assertTrue(outer.children.any { it is MarkdownContainers.Block.Quote })
        val inner = outer.children.filterIsInstance<MarkdownContainers.Block.Quote>().single()
        assertEquals("inner", text((inner.children.single() as MarkdownContainers.Block.Prose).node))
    }

    @Test fun quoteCanContainListAndListCanContainQuote() {
        val quote = MarkdownContainers.blocks(parse("> - item\n>   > quoted child")).single() as MarkdownContainers.Block.Quote
        val list = quote.children.single() as MarkdownContainers.Block.ListBlock
        assertTrue(list.items.single().children.any { it is MarkdownContainers.Block.Quote })
        assertTrue(list.items.single().children.filterIsInstance<MarkdownContainers.Block.Quote>().single().children.isNotEmpty())
    }

    @Test fun ordinaryProseRunsAreGroupedAroundPresentationContainers() {
        val blocks = MarkdownContainers.blocks(parse("before\n\n> quote\n\nafter"))
        assertEquals(3, blocks.size)
        assertEquals("before", text((blocks[0] as MarkdownContainers.Block.Prose).node))
        assertTrue(blocks[1] is MarkdownContainers.Block.Quote)
        assertEquals("after", text((blocks[2] as MarkdownContainers.Block.Prose).node))
    }

    @Test fun referenceDefinitionAtDocumentEndResolvesInEarlierContainers() {
        val root = parse("""> [guide][ref]
>
> | a | b |
> | - | - |
> | c | d |

[ref]: https://example.invalid/guide "guide"
""".trimEnd())
        val quote = MarkdownContainers.blocks(root).single() as MarkdownContainers.Block.Quote
        val link = all((quote.children.first() as MarkdownContainers.Block.Prose).node).filterIsInstance<Link>().single()
        assertEquals("https://example.invalid/guide", link.destination)
        assertEquals("guide", link.title)
        // A custom table remains a child of the quote, not promoted to a root presentation block.
        assertEquals(listOf("a", "b"), quote.children.filterIsInstance<MarkdownContainers.Block.Table>()
            .single().rows.first().cells.map { text(it.node) })
    }

    @Test fun referenceLinkAndInlineMathNodesKeepTheirParsedIdentityAndContents() {
        val root = parse("- **before §x§** [label][ref]\n\n[ref]: https://example.invalid/x")
        val originalMath = all(root).filterIsInstance<JLatexMathNode>().single()
        val originalLink = all(root).filterIsInstance<Link>().single()
        val list = MarkdownContainers.blocks(root).single() as MarkdownContainers.Block.ListBlock
        val output = list.items.single().children.single() as MarkdownContainers.Block.Prose
        assertSame(originalMath, all(output.node).filterIsInstance<JLatexMathNode>().single())
        assertSame(originalLink, all(output.node).filterIsInstance<Link>().single())
        assertEquals("https://example.invalid/x", originalLink.destination)
        assertEquals("label", text(originalLink))
        assertEquals("x", originalMath.latex())
        assertTrue(all(output.node).any { it is StrongEmphasis })
    }

    @Test fun fencedAndIndentedCodeLiteralsSurviveProseBlockCollection() {
        // Test AST presentation only; code source preprocessing is a separately documented gap.
        val root = parser().parse("""```kotlin
val x = "§y§"
```

    indented §z§""")
        fun code(root: Node) = all(root).mapNotNull { when (it) {
            is FencedCodeBlock -> it.literal
            is IndentedCodeBlock -> it.literal
            else -> null
        } }
        val original = code(root)
        val prose = MarkdownContainers.blocks(root).single() as MarkdownContainers.Block.Prose
        val collected = code(prose.node)
        assertEquals(2, original.size)
        assertEquals(original, collected)
        assertEquals("val x = \"§y§\"\n", collected[0])
        assertEquals("indented §z§\n", collected[1])
    }

    @Test fun taskMarkerCanBeRepresentedByManuallyConstructedParsedNode() {
        val root = Document()
        val task = io.noties.markwon.ext.tasklist.TaskListItem(true)
        task.appendChild(Paragraph().also { it.appendChild(Text("done")) })
        root.appendChild(BulletList().also { it.appendChild(task) })
        val list = MarkdownContainers.blocks(root).single() as MarkdownContainers.Block.ListBlock
        assertEquals(MarkdownContainers.Marker.Task(true), list.items.single().marker)
        assertEquals("done", text((list.items.single().children.single() as MarkdownContainers.Block.Prose).node))
    }

    @Test fun depthLimitLeavesDeepSubtreeIntactInProseFallback() {
        val root = Document()
        var parent: Node = root
        repeat(MarkdownContainers.MAX_PRESENTATION_DEPTH + 3) {
            val quote = BlockQuote()
            parent.appendChild(quote)
            parent = quote
        }
        parent.appendChild(Paragraph().also { it.appendChild(Text("deep leaf")) })
        val blocks = MarkdownContainers.blocks(root)
        var current = blocks.single() as MarkdownContainers.Block.Quote
        repeat(MarkdownContainers.MAX_PRESENTATION_DEPTH - 1) {
            current = current.children.single() as MarkdownContainers.Block.Quote
        }
        val fallback = current.children.single() as MarkdownContainers.Block.Prose
        assertEquals("deep leaf", text(fallback.node))
        assertTrue(all(fallback.node).any { it is BlockQuote })
    }

    @Test fun emptyDocumentProducesNoBlocks() {
        assertTrue(MarkdownContainers.blocks(parse("")).isEmpty())
    }

    @Test fun emptyContainersAreRetainedAsEmptyPresentationBlocks() {
        val root = Document().also { it.appendChild(BlockQuote()) }
        val quote = MarkdownContainers.blocks(root).single() as MarkdownContainers.Block.Quote
        assertTrue(quote.children.isEmpty())
    }

    @Test fun checkpointIsInvokedForRootChildren() {
        val root = parse("one\n\n> two\n\n- three")
        var calls = 0
        MarkdownContainers.blocks(root) { calls++ }
        assertTrue(calls >= 3)
    }

    @Test fun checkpointCancellationPropagatesWithoutBeingSwallowed() {
        val root = parse("one\n\n> two\n\n- three")
        var calls = 0
        val cancelled = try {
            MarkdownContainers.blocks(root) { if (++calls == 2) throw java.util.concurrent.CancellationException("cancel") }
            false
        } catch (_: java.util.concurrent.CancellationException) { true }
        assertTrue(cancelled)
        assertEquals(2, calls)
    }

    @Test fun cancellationIsCheckedWhileWalkingListItems() {
        val root = parse("- one\n- two\n- three")
        var calls = 0
        try {
            MarkdownContainers.blocks(root) { if (++calls == 3) throw java.util.concurrent.CancellationException() }
            fail("expected cancellation while traversing items")
        } catch (_: java.util.concurrent.CancellationException) {
            assertEquals(3, calls)
        }
    }

    @Test fun nonContainerBlocksAreKeptTogetherInProseDocument() {
        val root = parse("# heading\n\nparagraph\n\n> quote")
        val result = MarkdownContainers.blocks(root)
        assertEquals(2, result.size)
        val prose = result.first() as MarkdownContainers.Block.Prose
        assertTrue(all(prose.node).any { it is Heading })
        assertTrue(all(prose.node).any { it is Paragraph })
    }

    @Test fun parsedCodeWithinQuoteAndListIsNotReinterpretedDuringPresentation() {
        // Deliberately exercise block parsing/presentation, not the legacy global source scanner.
        val source = "> ~~~tex\n> \\(x\\) §y§\n> ~~~\n\n- item\n\n      \\[z §5\n"
        val root = parser().parse(source)
        val fenced = all(root).filterIsInstance<FencedCodeBlock>().single()
        val indented = all(root).filterIsInstance<IndentedCodeBlock>().single()
        val blocks = MarkdownContainers.blocks(root)
        val quote = blocks[0] as MarkdownContainers.Block.Quote
        val list = blocks[1] as MarkdownContainers.Block.ListBlock
        assertSame(fenced, all((quote.children.single() as MarkdownContainers.Block.Prose).node).filterIsInstance<FencedCodeBlock>().single())
        val nodes = all((list.items.single().children.single() as MarkdownContainers.Block.Prose).node)
        assertSame(indented, nodes.filterIsInstance<IndentedCodeBlock>().single())
        assertEquals("\\(x\\) §y§\n", fenced.literal)
        assertEquals("\\[z §5\n", indented.literal)
        assertTrue(nodes.none { it is JLatexMathNode })
    }

    @Test fun taskInOrderedListStillAdvancesFollowingOrdinal() {
        val list = OrderedList().apply { startNumber = 7 }
        list.appendChild(ListItem().also { it.appendChild(Paragraph().also { p -> p.appendChild(Text("first")) }) })
        list.appendChild(io.noties.markwon.ext.tasklist.TaskListItem(false))
        list.appendChild(ListItem().also { it.appendChild(Paragraph().also { p -> p.appendChild(Text("third")) }) })
        val blocks = MarkdownContainers.blocks(Document().also { it.appendChild(list) })
        val result = blocks.single() as MarkdownContainers.Block.ListBlock
        assertEquals(listOf(MarkdownContainers.Marker.Ordered(7), MarkdownContainers.Marker.Task(false), MarkdownContainers.Marker.Ordered(9)), result.items.map { it.marker })
    }

    @Test fun unknownListExtensionFallsBackWithoutDroppingItsSubtree() {
        val extension = object : CustomBlock() {}
        extension.appendChild(Paragraph().also { it.appendChild(Text("extension text")) })
        val list = BulletList().also { it.appendChild(extension) }
        val result = MarkdownContainers.blocks(Document().also { it.appendChild(list) }).single() as MarkdownContainers.Block.Prose
        assertSame(list, result.node.firstChild)
        assertEquals("extension text", text(result.node))
    }

    @Test fun rootTableSplitStillResolvesLinksBeforeContainerPresentation() {
        val root = parse("- [item][ref]\n\nA|B\n---|---\n[table][ref]|value\n\n> [quoted][ref]\n\n[ref]: https://example.invalid/shared")
        val resolved = all(root).filterIsInstance<Link>()
        assertEquals(3, resolved.size)
        assertTrue(resolved.all { it.destination == "https://example.invalid/shared" })
        val split = MarkdownTables.blocks(root)
        assertEquals(3, split.size)
        val first = MarkdownContainers.blocks((split[0] as MarkdownTables.Block.Prose).node).single() as MarkdownContainers.Block.ListBlock
        val last = MarkdownContainers.blocks((split[2] as MarkdownTables.Block.Prose).node).single() as MarkdownContainers.Block.Quote
        assertSame(resolved[0], all((first.items.single().children.single() as MarkdownContainers.Block.Prose).node).filterIsInstance<Link>().single())
        assertSame(resolved[2], all((last.children.single() as MarkdownContainers.Block.Prose).node).filterIsInstance<Link>().single())
    }
}
