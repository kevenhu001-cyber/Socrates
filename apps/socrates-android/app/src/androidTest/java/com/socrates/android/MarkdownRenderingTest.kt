package com.socrates.android

import io.noties.markwon.image.AsyncDrawableSpan
import android.text.Spanned
import android.widget.TextView
import androidx.activity.compose.setContent
import androidx.activity.ComponentActivity
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.createAndroidComposeRule
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

    private fun show(markdown: String = fixture) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            composeRule.activity.setContent {
                MaterialTheme { NativeMarkdown(text = markdown) }
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
        awaitMarkdown { views -> views.any { it.text.toString().contains("Ordered grandchild") && it.text.toString().contains("Alpha") } }
        val all = renderedViews().joinToString("\n") { it.text.toString() }
        listOf("Parent item", "Nested child", "Ordered grandchild", "Name", "Value", "Alpha", "Beta").forEach {
            assertTrue("missing rendered content: $it", all.contains(it))
        }
    }

    @Test fun taskItemsAndHyperlinkAreRendered() {
        show()
        awaitMarkdown { views -> views.any { it.text.toString().contains("Finished task") && it.text.toString().contains("Pending task") } }
        val view = renderedViews().first { it.text.toString().contains("Finished task") }
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
        awaitMarkdown { views -> views.any { view ->
            val t = view.text
            t is Spanned && t.getSpans(0, t.length, AsyncDrawableSpan::class.java).let { spans ->
                spans.size >= 4 && spans.all { it.drawable.result != null }
            }
        } }
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

    private fun isLatexDrawableSpan(span: Any): Boolean {
        val name = span.javaClass.name
        return name.contains("JLatexMathSpan") || name.contains("AsyncDrawableSpan") ||
            (name.contains("DrawableSpan") && name.contains("latex", ignoreCase = true))
    }
}
