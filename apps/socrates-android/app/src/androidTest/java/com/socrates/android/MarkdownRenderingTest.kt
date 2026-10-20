package com.socrates.android

import io.noties.markwon.image.AsyncDrawableSpan
import android.text.Spanned
import android.widget.TextView
import androidx.activity.compose.setContent
import androidx.activity.ComponentActivity
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.socrates.android.ui.MarkdownSource
import com.socrates.android.ui.NativeMarkdown
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Integration coverage for the production native Markwon renderer; the content below is test-only. */
@RunWith(AndroidJUnit4::class)
class MarkdownRenderingTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    private val fixture = """# Rendering fixture

A **bold** and *italic* phrase, plus ~~removed~~ text.

- Parent item
  - Nested child
    1. Ordered grandchild

| Name | Value |
| --- | --- |
| Alpha | 1 |
| Beta | 2 |

- [x] Finished task
- [ ] Pending task

[Reference link](https://example.invalid/test)

Inline math: \(x_i + 1\) and ${'$'}a^2 + b^2${'$'}.

\[\frac{1}{2} + \sqrt{x}\]

$$
\int_0^1 x^2 \, dx
$$
""".trimIndent()

    private fun show(markdown: String = fixture, streaming: Boolean = false) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            composeRule.activity.setContent {
                MaterialTheme { NativeMarkdown(text = markdown, streaming = streaming) }
            }
        }
        composeRule.waitForIdle()
    }

    private fun renderedViews(): List<TextView> {
        val result = mutableListOf<TextView>()
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            fun visit(view: android.view.View) {
                if (view is TextView) result += view
                if (view is android.view.ViewGroup) {
                    for (i in 0 until view.childCount) visit(view.getChildAt(i))
                }
            }
            visit(composeRule.activity.window.decorView)
        }
        return result
    }

    private fun awaitMarkdown(predicate: (List<TextView>) -> Boolean) {
        composeRule.waitUntil(timeoutMillis = 45_000) { predicate(renderedViews()) }
    }

    @Test fun headingsAndEmphasisAreRenderedIntoNativeTextViewSpans() {
        show()
        awaitMarkdown { views -> views.any { it.text.toString().contains("Rendering fixture") && it.text is Spanned } }
        val text = renderedViews().first { it.text.toString().contains("Rendering fixture") }.text as Spanned
        assertTrue("heading should have a size/style span", text.getSpans(0, text.length, Any::class.java).any { span ->
            span.javaClass.name.contains("Heading") || span.javaClass.name.contains("RelativeSize") || span.javaClass.name.contains("Style")
        })
        assertTrue(text.toString().contains("bold") && text.toString().contains("italic"))
    }

    @Test fun nestedListsAndTableCellsRemainPresentInRenderedText() {
        show()
        awaitMarkdown { views -> views.any { it.text.toString().contains("Ordered grandchild") } &&
            views.any { it.text.toString() == "Alpha" } }
        val all = renderedViews().joinToString("\n") { it.text.toString() }
        listOf("Parent item", "Nested child", "Ordered grandchild", "Name", "Value", "Alpha", "Beta").forEach {
            assertTrue("missing rendered content: $it", all.contains(it))
        }
    }

    @Test fun taskItemsAndHyperlinkAreRendered() {
        show()
        awaitMarkdown { views -> listOf("Finished task", "Pending task", "Reference link").all { label ->
            views.any { it.text.toString().contains(label) }
        } }
        val view = renderedViews().first { it.text.toString().contains("Reference link") }
        val spanned = view.text as Spanned
        assertTrue(spanned.getSpans(0, spanned.length, Any::class.java).any {
            it.javaClass.name.contains("URLSpan") || it.javaClass.name.contains("Link")
        })
        assertTrue(renderedViews().any { it.text.toString().contains("Reference link") })
    }

    @Test fun normalizedInlineAndDisplayMathProduceLatexDrawableSpansNotTexText() {
        show()
        awaitMarkdown { views -> views.any { v ->
            val s = v.text
            s is Spanned && s.getSpans(0, s.length, Any::class.java).any { isLatexDrawableSpan(it) }
        } }
        val spans = renderedViews().flatMap { view ->
            val s = view.text
            if (s is Spanned) s.getSpans(0, s.length, Any::class.java).toList() else emptyList()
        }
        assertTrue("expected a JLatexMath/Markwon drawable span", spans.any(::isLatexDrawableSpan))
    }

    @Test fun referenceCircuitMathFinishesActualNativeDrawing() {
        val math = """### 正确答案

设 \(b\) 为参考节点，\(V_b=0\)。

\[
\boxed{\begin{aligned}U_{\mathrm{Th}}&=-40\mathrm{V}\\R_{\mathrm{Th}}&=40\Omega\end{aligned}}
\]

- 两条支路并联，**每条都是** \(20\Omega+60\Omega=80\Omega\)。
""".trimIndent()
        show(math)
        awaitMarkdown { views -> views.flatMap { view ->
            val t = view.text
            if (t is Spanned) t.getSpans(0, t.length, AsyncDrawableSpan::class.java).toList() else emptyList()
        }.let { spans -> spans.size >= 4 && spans.all { it.drawable.result != null } } }
    }

    @Test fun markdownImagesAndLatexHaveIndependentCompletedDrawables() {
        val image = android.graphics.Bitmap.createBitmap(2, 2, android.graphics.Bitmap.Config.ARGB_8888)
        val bytes = java.io.ByteArrayOutputStream().also { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
        image.recycle()
        val encoded = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
        show("![真实测试图片](data:image/png;base64,$encoded)\n\n\\(x^2+y^2=z^2\\)")
        awaitMarkdown { views -> views.any { view ->
            val t = view.text
            t is Spanned && t.getSpans(0, t.length, AsyncDrawableSpan::class.java).let { spans ->
                spans.size >= 2 && spans.all { it.drawable.result != null } &&
                    spans.any { it.javaClass.name.contains("JLatex") } && spans.any { !it.javaClass.name.contains("JLatex") }
            }
        } }
    }

    @Test fun normalizationAcceptsAllFourModelMathDelimiters() {
        val cases = listOf(
            "\\(x_i\\)" to "${'$'}${'$'}x_i${'$'}${'$'}",
            "\\[x^2\\]" to "\n\n$$\nx^2\n$$\n\n",
            "${'$'}a+b${'$'}" to "${'$'}${'$'}a+b${'$'}${'$'}",
            "${'$'}${'$'}c+d${'$'}${'$'}" to "\n\n$$\nc+d\n$$\n\n"
        )
        cases.forEach { (source, expected) -> assertTrue("failed normalization for $source", MarkdownSource.normalize(source).contains(expected)) }
    }

    @Test fun fixtureUsesNativeTextViewsAndDoesNotTurnTexIntoVisibleSource() {
        show()
        awaitMarkdown { views -> views.any { it.text.toString().contains("Rendering fixture") } }
        val texts = renderedViews().map { view ->
            val value = view.text
            if (value is Spanned) {
                val visible = StringBuilder(value)
                value.getSpans(0, value.length, AsyncDrawableSpan::class.java)
                    .sortedByDescending { value.getSpanStart(it) }
                    .forEach { visible.replace(value.getSpanStart(it), value.getSpanEnd(it), "[公式]") }
                visible.toString()
            } else value.toString()
        }
        assertTrue("production renderer should attach native TextViews", texts.any { it.contains("Rendering fixture") })
        assertTrue("TeX command should be covered by drawable spans", texts.none { it.contains("\\frac") || it.contains("\\int") })
    }

    @Test fun literalPricesAndProseCoexistWithCompletedNativeMath() {
        show("价格 ${'$'}5-${'$'}10；${'$'}only${'$'}；概率 ${'$'}1/2${'$'}；变量 ${'$'}x${'$'}。")
        awaitMarkdown { views -> views.any { view ->
            val value = view.text
            value is Spanned && value.toString().contains("${'$'}5-${'$'}10") &&
                value.toString().contains("${'$'}only${'$'}") &&
                value.getSpans(0, value.length, AsyncDrawableSpan::class.java).let { spans ->
                    spans.size == 2 && spans.all { it.drawable.result != null }
                }
        } }
    }

    @Test fun rejectedPriceCandidateDoesNotHideFollowingFormula() {
        show("花费 ${'$'}5，概率 ${'$'}1/2${'$'}。")
        awaitMarkdown { views -> views.any { view ->
            val value = view.text
            value is Spanned && value.toString().contains("花费 ${'$'}5，概率") &&
                value.getSpans(0, value.length, AsyncDrawableSpan::class.java).let { spans ->
                    spans.size == 1 && spans.single().drawable.result != null
                }
        } }
    }

    @Test fun doubleTickCodeRemainsLiteralBesideNativeMath() {
        show("代码 ``a ` ${'$'}x${'$'} \\(b\\)``；公式 ${'$'}y${'$'}。")
        awaitMarkdown { views -> views.any { view ->
            val value = view.text
            value is Spanned && value.toString().contains("a ` ${'$'}x${'$'} \\(b\\)") &&
                value.getSpans(0, value.length, AsyncDrawableSpan::class.java).let { spans ->
                    spans.size == 1 && spans.single().drawable.result != null
                }
        } }
    }

    @Test fun unfinishedBacktickDoesNotSuppressNativeMath() {
        show("未闭合 `；公式 ${'$'}y${'$'}。")
        awaitMarkdown { views -> views.any { view ->
            val value = view.text
            value is Spanned && value.toString().contains("未闭合 `") &&
                value.getSpans(0, value.length, AsyncDrawableSpan::class.java).let { spans ->
                    spans.size == 1 && spans.single().drawable.result != null
                }
        } }
    }

    @Test fun streamingExplicitMathShowsSelectableLiteralTailBesideRenderedPrefix() {
        show("前文 **强调**；\\[x_i + \\frac{1}", streaming = true)
        composeRule.onNodeWithText("公式生成中 · 原文").assertExists()
        composeRule.onNodeWithText("\\[x_i + \\frac{1}").assertExists()
        awaitMarkdown { views -> views.any { it.text.toString().contains("前文 强调") } }
        assertTrue(renderedViews().none { it.text.toString().contains("\\frac") })
    }

    @Test fun arrivingCloserReplacesPendingSourceWithCompletedNativeMath() {
        val source = mutableStateOf("前文 \\(x_i")
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            composeRule.activity.setContent { MaterialTheme { NativeMarkdown(source.value, streaming = true) } }
        }
        composeRule.waitForIdle()
        composeRule.onNodeWithText("公式生成中 · 原文").assertExists()
        composeRule.runOnIdle { source.value = "前文 \\(x_i\\)" }
        awaitMarkdown { views -> views.any { view ->
            val t = view.text
            t is Spanned && t.getSpans(0, t.length, AsyncDrawableSpan::class.java)
                .any { it.javaClass.name.contains("JLatex") && it.drawable.result != null }
        } }
        composeRule.onNodeWithText("公式生成中 · 原文").assertDoesNotExist()
        composeRule.onNodeWithText("\\(x_i").assertDoesNotExist()
    }

    @Test fun stoppingStreamRemovesPendingStatusWithoutFabricatingCloser() {
        val streaming = mutableStateOf(true)
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            composeRule.activity.setContent { MaterialTheme { NativeMarkdown("\\[x_i", streaming = streaming.value) } }
        }
        composeRule.waitForIdle()
        composeRule.onNodeWithText("公式生成中 · 原文").assertExists()
        composeRule.runOnIdle { streaming.value = false }
        composeRule.onNodeWithText("公式生成中 · 原文").assertDoesNotExist()
        composeRule.onNodeWithText("\\[x_i").assertExists()
        // Final CommonMark treats the original \[ as an escaped literal [, not as repaired TeX.
        awaitMarkdown { views -> views.any { it.text.toString() == "[x_i" } }
        assertTrue(renderedViews().none { view ->
            val t = view.text
            t is Spanned && t.getSpans(0, t.length, AsyncDrawableSpan::class.java).isNotEmpty()
        })
    }

    @Test fun streamingPricesDoNotShowPendingMath() {
        show("价格 ${'$'}5-${'$'}10；变量 ${'$'}x${'$'}。", streaming = true)
        composeRule.onNodeWithText("公式生成中 · 原文").assertDoesNotExist()
        awaitMarkdown { views -> views.any { it.text.toString().contains("${'$'}5-${'$'}10") } }
    }

    @Test fun streamingCodeFenceDoesNotShowPendingMath() {
        show("```tex\n\\[x_i", streaming = true)
        composeRule.onNodeWithText("公式生成中 · 原文").assertDoesNotExist()
        composeRule.onNodeWithText("\\[x_i").assertExists()
    }

    @Test fun overIndentedCloserKeepsTexInsideCodeUntilValidCloser() {
        show("```tex\n    ```\n\\[x_i\n```\n正文 \\(y\\)", streaming = true)
        composeRule.onNodeWithText("    ```\n\\[x_i\n").assertExists()
        composeRule.onNodeWithText("公式生成中 · 原文").assertDoesNotExist()
        awaitMarkdown { views -> views.any { view ->
            val t = view.text
            t is Spanned && t.toString().contains("正文") &&
                t.getSpans(0, t.length, AsyncDrawableSpan::class.java).let { spans ->
                    spans.size == 1 && spans.single().drawable.result != null
                }
        } }
    }

    @Test fun codePanelKeepsTrailingSpacesAndBlankLines() {
        show("```txt\nvalue  \n\n\n```")
        composeRule.onNodeWithText("value  \n\n\n").assertExists()
    }

    @Test fun unclosedCodePanelDoesNotAddAnEofNewline() {
        show("```tex\n\\[x_i", streaming = true)
        composeRule.onNodeWithText("\\[x_i").assertExists()
        composeRule.onNodeWithText("\\[x_i\n").assertDoesNotExist()
        composeRule.onNodeWithText("公式生成中 · 原文").assertDoesNotExist()
    }

    @Test fun codePanelRemovesOnlyTheOpeningFenceIndent() {
        show("  ~~~txt\n  one\n   two\nzero\n  ~~~")
        composeRule.onNodeWithText("one\n two\nzero\n").assertExists()
    }

    @Test fun gfmTableCreatesIndependentNativeCellsWithoutTableRowSpans() {
        show("Before\n\nA|B\n---|---\nleft|right\n\nAfter")
        awaitMarkdown { views -> listOf("Before", "A", "B", "left", "right", "After").all { value -> views.any { it.text.toString() == value } } }
        assertTrue(renderedViews().none { view ->
            val value = view.text
            value is Spanned && value.getSpans(0, value.length, Any::class.java).any { it.javaClass.name.contains("TableRowSpan") }
        })
    }

    @Test fun tableCellsRetainEmphasisReferenceLinksAndLiteralCode() {
        show("A|B\n---|---\n**bold** [link][ref]|`a\\|b`\n\n[ref]: https://example.invalid/ref")
        awaitMarkdown { views -> views.any { it.text.toString() == "bold link" } && views.any { it.text.toString() == "a|b" } }
        val value = renderedViews().first { it.text.toString() == "bold link" }.text as Spanned
        assertTrue(value.getSpans(0, value.length, Any::class.java).any { it.javaClass.name.contains("StrongEmphasis") })
        assertTrue(value.getSpans(0, value.length, Any::class.java).any { it.javaClass.name.contains("Link") })
    }

    @Test fun tableMathPipesRestoreOriginalTexAndFinishNativeDrawables() {
        show("Math|Literal\n---|---\n\\(|x|+\\|y\\|\\)|`\\(x\\)`")
        awaitMarkdown { views -> views.any { view ->
            val value = view.text
            view.parent is android.widget.TableRow && value is Spanned &&
                value.getSpans(0, value.length, AsyncDrawableSpan::class.java).let { spans ->
                spans.size == 1 && spans.single().drawable.result != null
            }
        } && views.any { it.text.toString() == "\\(x\\)" } }
        assertTrue(renderedViews().none { it.text.toString().contains("SOCRATESMATHPIPE") })
        assertTrue(renderedViews().any { (it.parent as? android.widget.TableRow)?.parent is android.widget.TableLayout })
    }

    @Test fun tableMathRemainsInsideEmphasisAndReferenceLinkBesideLiteralCode() {
        show("Math|Code\n---|---\n**[${'$'}x_i${'$'}][ref]**|`${'$'}y${'$'}`\n\n[ref]: https://example.invalid/ref")
        awaitMarkdown { views -> views.any { view ->
            val value = view.text
            view.parent is android.widget.TableRow && value is Spanned &&
                value.getSpans(0, value.length, AsyncDrawableSpan::class.java).let { spans ->
                    spans.size == 1 && spans.single().drawable.result != null
                } && value.getSpans(0, value.length, Any::class.java).let { spans ->
                    spans.any { it.javaClass.name.contains("Link") } && spans.any { it.javaClass.name.contains("StrongEmphasis") }
                }
        } && views.any { it.text.toString() == "${'$'}y${'$'}" } }
    }

    @Test fun overlongTableMathIsLiteralWhileAdjacentCellStillDrawsMath() {
        val body = "x".repeat(com.socrates.android.ui.MarkdownTableMath.MAX_MATH_LENGTH + 1)
        show("Math|Other\n---|---\n\\($body\\)|${'$'}y${'$'}")
        val literal = "${'$'}${'$'}$body${'$'}${'$'}"
        awaitMarkdown { views -> views.any { it.parent is android.widget.TableRow && it.text.toString() == literal } &&
            views.any { view ->
                val value = view.text
                view.parent is android.widget.TableRow && value is Spanned &&
                    value.getSpans(0, value.length, AsyncDrawableSpan::class.java).let { spans ->
                        spans.size == 1 && spans.single().drawable.result != null
                    }
            }
        }
        val value = renderedViews().first { it.text.toString() == literal }.text as Spanned
        assertTrue(value.getSpans(0, value.length, AsyncDrawableSpan::class.java).isEmpty())
    }

    @Test fun tableMathCountBudgetCannotBeBypassedByDefaultLatexPlugin() {
        val limit = com.socrates.android.ui.MarkdownTableMath.MAX_MATH_PER_CELL
        show("Math|Other\n---|---\n" + List(limit) { "${'$'}x${'$'}" }.joinToString(" ") + " ${'$'}5 fee \\(y\\)|value")
        awaitMarkdown { views -> views.any { view ->
            val value = view.text
            view.parent is android.widget.TableRow && value is Spanned && value.toString().contains("${'$'}5 fee ${'$'}${'$'}y${'$'}${'$'}") &&
                value.getSpans(0, value.length, AsyncDrawableSpan::class.java).let { spans ->
                    spans.size == limit && spans.all { it.drawable.result != null }
                }
        } }
    }

    @Test fun tableRemainsHorizontallyScrollableWithSharedColumnWidths() {
        show("A|B|C|D\n---|---|---|---\n" + List(4) { "long-".repeat(30) }.joinToString("|"))
        awaitMarkdown { views -> views.any { it.text.toString().startsWith("long-") } }
        composeRule.runOnIdle {
            val cell = renderedViews().first { it.text.toString() == "A" }
            val layout = cell.parent.parent as android.widget.TableLayout
            val scroll = layout.parent as android.widget.HorizontalScrollView
            assertTrue(layout.width > scroll.width)
            val header = layout.getChildAt(0) as android.widget.TableRow
            val body = layout.getChildAt(1) as android.widget.TableRow
            for (column in 0 until header.childCount) assertTrue(header.getChildAt(column).width == body.getChildAt(column).width)
            scroll.scrollTo(layout.width, 0)
            assertTrue(scroll.scrollX > 0)
        }
    }

    @Test fun arrivingRowsReplaceTableCellsWithoutLeavingOldViews() {
        val source = mutableStateOf("A|B\n---|---\nold|one")
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            composeRule.activity.setContent { MaterialTheme { NativeMarkdown(source.value, streaming = true) } }
        }
        awaitMarkdown { views -> views.any { it.text.toString() == "old" } }
        composeRule.runOnIdle { source.value = "A|B\n---|---\nnew|two\nnext|three" }
        awaitMarkdown { views -> views.any { it.text.toString() == "new" } && views.any { it.text.toString() == "next" } && views.none { it.text.toString() == "old" } }
    }

    @Test fun malformedTableStaysProseInsteadOfInventingCells() {
        show("A|B\n--x|---\nleft|right")
        awaitMarkdown { views -> views.any { it.text.toString().contains("left|right") } }
        assertTrue(renderedViews().none { it.parent is android.widget.TableRow })
    }

    @Test fun tablesInsideFencedCodeRemainLiteralCodePanels() {
        show("```text\nA|B\n---|---\nleft|right\n```")
        composeRule.onNodeWithText("A|B\n---|---\nleft|right\n").assertExists()
        assertTrue(renderedViews().none { it.parent is android.widget.TableRow })
    }

    @Test fun nestedListsUseIndependentContainersAndParserOrdinals() {
        show("7. Parent\n   - Child\n     1. Grandchild\n42. Next")
        awaitMarkdown { views -> views.any { it.text.toString() == "Grandchild" } }
        composeRule.onAllNodesWithTag("markdown-list", useUnmergedTree = true).assertCountEquals(3)
        composeRule.onNodeWithText("7.", useUnmergedTree = true).assertExists()
        composeRule.onNodeWithText("8.", useUnmergedTree = true).assertExists()
        composeRule.onNodeWithText("42.", useUnmergedTree = true).assertDoesNotExist()
        assertTrue(renderedViews().none { view ->
            val s = view.text
            s is Spanned && s.getSpans(0, s.length, Any::class.java).any { it.javaClass.name.contains("BulletListItemSpan") }
        })
    }

    @Test fun nestedQuotesAndListsDoNotDoubleApplyTextViewContainerSpans() {
        show("> Outer\n>\n> > - **[label][ref]** \\(x\\)\n\n[ref]: https://example.invalid/ref")
        awaitMarkdown { views -> views.any { view ->
            val s = view.text
            s is Spanned && s.toString().contains("label") &&
                s.getSpans(0, s.length, AsyncDrawableSpan::class.java).any { it.drawable.result != null }
        } }
        composeRule.onAllNodesWithTag("markdown-quote", useUnmergedTree = true).assertCountEquals(2)
        composeRule.onAllNodesWithTag("markdown-list", useUnmergedTree = true).assertCountEquals(1)
        val s = renderedViews().first { it.text.toString().contains("label") }.text as Spanned
        val spans = s.getSpans(0, s.length, Any::class.java)
        assertTrue(spans.any { it.javaClass.name.contains("Link") })
        assertTrue(spans.any { it.javaClass.name.contains("StrongEmphasis") })
        assertTrue(spans.none { it.javaClass.name.contains("BlockQuoteSpan") || it.javaClass.name.contains("BulletListItemSpan") })
    }

    @Test fun parsedTaskStatesAreReadOnlyAndRetainNestedContent() {
        show("- [x] Finished\n  - Nested\n- [ ] Pending")
        awaitMarkdown { views -> listOf("Finished", "Nested", "Pending").all { label -> views.any { it.text.toString() == label } } }
        val tasks = composeRule.onAllNodes(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Checkbox), useUnmergedTree = true)
        tasks.assertCountEquals(2)
        tasks[0].assertHasNoClickAction()
        tasks[1].assertHasNoClickAction()
        composeRule.onAllNodes(SemanticsMatcher.expectValue(SemanticsProperties.ToggleableState, androidx.compose.ui.state.ToggleableState.On), useUnmergedTree = true).assertCountEquals(1)
        composeRule.onAllNodes(SemanticsMatcher.expectValue(SemanticsProperties.ToggleableState, androidx.compose.ui.state.ToggleableState.Off), useUnmergedTree = true).assertCountEquals(1)
    }

    @Test fun tableWithinQuoteRetainsItsContainerAndUsesNativeCells() {
        show("> A|B\n> ---|---\n> left|right")
        awaitMarkdown { views -> listOf("A", "B", "left", "right").all { value ->
            views.any { it.parent is android.widget.TableRow && it.text.toString() == value }
        } }
        composeRule.onAllNodesWithTag("markdown-quote", useUnmergedTree = true).assertCountEquals(1)
        assertTrue(renderedViews().none { view ->
            val value = view.text
            value is Spanned && value.getSpans(0, value.length, Any::class.java).any {
                it.javaClass.name.contains("TableRowSpan") || it.javaClass.name.contains("BlockQuoteSpan")
            }
        })
    }

    @Test fun tableInOrderedListQuoteKeepsCustomContainersAndSharedColumnGeometry() {
        val longCell = "long-".repeat(30)
        show("7. > A|B|C\n   > ---|---|---\n   > $longCell|$longCell|$longCell\n8. after")
        awaitMarkdown { views -> views.count { it.parent is android.widget.TableRow && it.text.toString() == longCell } == 3 &&
            views.any { it.text.toString() == "after" } }
        composeRule.onAllNodesWithTag("markdown-quote", useUnmergedTree = true).assertCountEquals(1)
        composeRule.onAllNodesWithTag("markdown-list", useUnmergedTree = true).assertCountEquals(1)
        composeRule.onNodeWithText("7.", useUnmergedTree = true).assertExists()
        composeRule.onNodeWithText("8.", useUnmergedTree = true).assertExists()
        composeRule.runOnIdle {
            val layout = renderedViews().first { it.text.toString() == "A" }.parent.parent as android.widget.TableLayout
            val scroll = layout.parent as android.widget.HorizontalScrollView
            assertTrue(scroll.width > 0 && scroll.width < composeRule.activity.window.decorView.width)
            assertTrue(layout.width > scroll.width)
            val header = layout.getChildAt(0) as android.widget.TableRow
            val body = layout.getChildAt(1) as android.widget.TableRow
            for (column in 0 until header.childCount) assertTrue(header.getChildAt(column).width == body.getChildAt(column).width)
            scroll.scrollTo(layout.width, 0)
            assertTrue(scroll.scrollX > 0)
        }
    }

    @Test fun nestedTableCellsKeepMathReferenceEmphasisAndLiteralCode() {
        show("> - Math|Code\n>   ---|---\n>   **[\\(|x|\\)][ref]**|`${'$'}y${'$'}`\n\n[ref]: https://example.invalid/ref")
        awaitMarkdown { views -> views.any { view ->
            val value = view.text
            view.parent is android.widget.TableRow && value is Spanned &&
                value.getSpans(0, value.length, AsyncDrawableSpan::class.java).let { spans ->
                    spans.size == 1 && spans.single().drawable.result != null
                } && value.getSpans(0, value.length, Any::class.java).let { spans ->
                    spans.any { it.javaClass.name.contains("Link") } && spans.any { it.javaClass.name.contains("StrongEmphasis") }
                }
        } && views.any { it.parent is android.widget.TableRow && it.text.toString() == "${'$'}y${'$'}" } }
        assertTrue(renderedViews().none { it.text.toString().contains("SOCRATESMATHPIPE") })
    }

    @Test fun nestedTableOverlongMathStillFallsBackPerCell() {
        val body = "x".repeat(com.socrates.android.ui.MarkdownTableMath.MAX_MATH_LENGTH + 1)
        show("- Math|Other\n  ---|---\n  \\($body\\)|${'$'}y${'$'}")
        val literal = "${'$'}${'$'}$body${'$'}${'$'}"
        awaitMarkdown { views -> views.any { it.parent is android.widget.TableRow && it.text.toString() == literal } &&
            views.any { view ->
                val value = view.text
                view.parent is android.widget.TableRow && value is Spanned &&
                    value.getSpans(0, value.length, AsyncDrawableSpan::class.java).let { spans ->
                        spans.size == 1 && spans.single().drawable.result != null
                    }
            }
        }
        val value = renderedViews().first { it.text.toString() == literal }.text as Spanned
        assertTrue(value.getSpans(0, value.length, AsyncDrawableSpan::class.java).isEmpty())
    }

    @Test fun streamingNestedTableReplacementDoesNotLeaveCellsOrHostsBehind() {
        val source = mutableStateOf("> - A|B\n>   ---|---\n>   old|one")
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            composeRule.activity.setContent { MaterialTheme { NativeMarkdown(source.value, streaming = true) } }
        }
        awaitMarkdown { views -> views.any { it.parent is android.widget.TableRow && it.text.toString() == "old" } }
        composeRule.runOnIdle { source.value = "> - A|B\n>   ---|---\n>   new|two\n>   next|three" }
        awaitMarkdown { views -> views.none { it.text.toString() == "old" } &&
            listOf("new", "next").all { label -> views.any { it.parent is android.widget.TableRow && it.text.toString() == label } } }
        composeRule.runOnIdle { source.value = "> - replacement" }
        awaitMarkdown { views -> views.any { it.text.toString() == "replacement" } && views.none { it.parent is android.widget.TableRow } }
        composeRule.onAllNodesWithTag("markdown-quote", useUnmergedTree = true).assertCountEquals(1)
        composeRule.onAllNodesWithTag("markdown-list", useUnmergedTree = true).assertCountEquals(1)
    }

    @Test fun malformedAndCodeTableTextInsideContainersDoesNotInventNativeCells() {
        show("> A|B\n> --x|---\n> left|right\n\n- ~~~text\n  C|D\n  ---|---\n  code|literal\n  ~~~")
        awaitMarkdown { views -> views.any { it.text.toString().contains("left|right") } &&
            views.any { it.text.toString().contains("code|literal") } }
        assertTrue(renderedViews().none { it.parent is android.widget.TableRow })
    }

    @Test fun streamingContainerReplacementReleasesPreviousLeafViews() {
        val source = mutableStateOf("> - old \\(x\\)")
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            composeRule.activity.setContent { MaterialTheme { NativeMarkdown(source.value, streaming = true) } }
        }
        awaitMarkdown { views -> views.any { it.text.toString().contains("old") } }
        composeRule.runOnIdle { source.value = "- new\n  > replacement \\(y\\)" }
        awaitMarkdown { views -> views.none { it.text.toString().contains("old") } && views.any { it.text.toString().contains("replacement") } }
        composeRule.onAllNodesWithTag("markdown-quote", useUnmergedTree = true).assertCountEquals(1)
        composeRule.onAllNodesWithTag("markdown-list", useUnmergedTree = true).assertCountEquals(1)
    }

    @Test fun settledSoftBreaksRenderAsNewlinesWithoutLosingInlineSpans() {
        show("第一行🙂\n**第二行**\n[第三行](https://example.invalid)")
        awaitMarkdown { views -> views.any { it.text.toString() == "第一行🙂\n第二行\n第三行" } }
        val text = renderedViews().first { it.text.toString().contains("第一行🙂") }.text as Spanned
        assertTrue(text.getSpans(0, text.length, Any::class.java).any { it.javaClass.name.contains("StrongEmphasis") })
        assertTrue(text.getSpans(0, text.length, Any::class.java).any { it.javaClass.name.contains("Link") })
    }

    @Test fun streamingAndSettledSoftBreakTextMatchesAcrossUpdates() {
        val source = mutableStateOf("first\nsec")
        val streaming = mutableStateOf(true)
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            composeRule.activity.setContent { MaterialTheme { NativeMarkdown(source.value, streaming = streaming.value) } }
        }
        awaitMarkdown { views -> views.any { it.text.toString() == "first\nsec" } }
        composeRule.runOnIdle { source.value = "first\nsecond\nthird" }
        awaitMarkdown { views -> views.any { it.text.toString() == "first\nsecond\nthird" } }
        composeRule.runOnIdle { streaming.value = false }
        awaitMarkdown { views -> views.any { it.text.toString() == "first\nsecond\nthird" } }
    }

    @Test fun nestedContainerSoftBreaksStayWithinTheirLeafTextView() {
        show("> - first\n>   second\n> - next\n>   final")
        awaitMarkdown { views -> views.any { it.text.toString() == "first\nsecond" } &&
            views.any { it.text.toString() == "next\nfinal" } }
        composeRule.onAllNodesWithTag("markdown-quote", useUnmergedTree = true).assertCountEquals(1)
        composeRule.onAllNodesWithTag("markdown-list", useUnmergedTree = true).assertCountEquals(1)
    }

    @Test fun explicitHardBreaksAreNotDoubledBySoftBreakPlugin() {
        show("one  \ntwo\\\nthree\nfour")
        awaitMarkdown { views -> views.any { it.text.toString() == "one\ntwo\nthree\nfour" } }
    }

    @Test fun softBreakPluginDoesNotTurnInlineCodeNewlinesIntoVisualBreaks() {
        show("`first\nsecond`\nthird")
        awaitMarkdown { views -> views.any { it.text.toString() == "first second\nthird" } }
    }

    private fun isLatexDrawableSpan(span: Any): Boolean {
        val name = span.javaClass.name
        return name.contains("JLatexMathSpan") || name.contains("AsyncDrawableSpan") ||
            (name.contains("DrawableSpan") && name.contains("latex", ignoreCase = true))
    }
}
