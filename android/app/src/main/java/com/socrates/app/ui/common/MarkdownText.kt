package com.socrates.app.ui.common

import android.widget.TextView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.socrates.app.ui.theme.SocratesTheme
import io.noties.markwon.Markwon
import io.noties.markwon.ext.katex.KatexPlugin
import io.noties.markwon.ext.prism4j.Prism4jPlugin

/**
 * Markdown renderer powered by Markwon with KaTeX math and Prism4j code highlighting.
 *
 * Uses an AndroidView wrapping a Markwon-configured TextView that handles
 * ATX headings, lists, blockquotes, code fences, inline styles, LaTeX math,
 * and syntax-highlighted code blocks.
 */
@Composable
fun MarkdownText(
    raw: String,
    modifier: Modifier = Modifier,
    color: Color = SocratesTheme.colors.text100,
    fontSize: TextUnit = 14.sp,
    lineHeight: TextUnit = 23.sp,
) {
    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            val mw = Markwon.builder(ctx)
                .usePlugin(KatexPlugin.create())
                .usePlugin(Prism4jPlugin.create())
                .build()
            TextView(ctx).also { tv ->
                tv.setTextColor(color.toArgb())
                tv.textSize = fontSize.value
                tv.setLineSpacing(0f, 1.6f)
                mw.setMarkdown(tv, raw)
            }
        },
        update = { tv ->
            val mw = Markwon.builder(tv.context)
                .usePlugin(KatexPlugin.create())
                .usePlugin(Prism4jPlugin.create())
                .build()
            tv.setTextColor(color.toArgb())
            tv.textSize = fontSize.value
            mw.setMarkdown(tv, raw)
        },
    )
}
