package com.socrates.android.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.*
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

enum class ReferenceGlyph { Menu, Plus, Close, Mic, Wave, ArrowUp, ArrowDown, Back, Search, Compose, More, MoreHorizontal, Copy, Share, Folder, Image, Camera, Paperclip, Clock, Plugin, Reasoning, Pin, Archive, Trash, Check, ThumbUp, ThumbDown, Speaker, Document, Globe, Refresh, Person, Settings, SignOut, Eye, EyeOff }

/** Hand-drawn round-cap, round-join glyph family. The canvas is a 24-unit grid. */
@Composable
fun ReferenceIcon(glyph: ReferenceGlyph, description: String? = null, modifier: Modifier = Modifier, tint: Color = LocalContentColor.current) {
    Canvas(modifier.size(24.dp).then(if (description == null) Modifier.clearAndSetSemantics {} else Modifier.semantics { contentDescription = description })) {
        scale(size.width / 24f, size.height / 24f, pivot = Offset.Zero) {
            val stroke = Stroke(width = 1.85f, cap = StrokeCap.Round, join = StrokeJoin.Round)
            fun path(block: Path.() -> Unit) { drawPath(Path().apply(block), tint, style = stroke) }
            fun line(x: Float, y: Float, xx: Float, yy: Float) { drawLine(tint, Offset(x, y), Offset(xx, yy), 1.85f, StrokeCap.Round) }
            fun circle(x: Float, y: Float, r: Float) { drawCircle(tint, r, Offset(x, y), style = stroke) }
            when (glyph) {
                ReferenceGlyph.Menu -> { line(4f, 7f, 20f, 7f); line(4f, 15f, 14f, 15f) }
                ReferenceGlyph.Plus -> { line(12f, 3f, 12f, 21f); line(3f, 12f, 21f, 12f) }
                ReferenceGlyph.Close -> { line(5f, 5f, 19f, 19f); line(19f, 5f, 5f, 19f) }
                ReferenceGlyph.Back -> { line(4f, 12f, 21f, 12f); path { moveTo(11f, 4f); lineTo(3f, 12f); lineTo(11f, 20f) } }
                ReferenceGlyph.ArrowUp -> { line(12f, 3f, 12f, 21f); path { moveTo(5f, 10f); lineTo(12f, 3f); lineTo(19f, 10f) } }
                ReferenceGlyph.ArrowDown -> { line(12f, 3f, 12f, 21f); path { moveTo(5f, 14f); lineTo(12f, 21f); lineTo(19f, 14f) } }
                ReferenceGlyph.Search -> { circle(10f, 10f, 7f); line(15.5f, 15.5f, 21f, 21f) }
                ReferenceGlyph.Document -> { path { moveTo(14f, 2f); lineTo(5f, 2f); quadraticTo(3f, 2f, 3f, 4f); lineTo(3f, 20f); quadraticTo(3f, 22f, 5f, 22f); lineTo(19f, 22f); quadraticTo(21f, 22f, 21f, 20f); lineTo(21f, 9f); close(); moveTo(14f, 2f); lineTo(14f, 9f); lineTo(21f, 9f) }; line(7f, 14f, 17f, 14f); line(7f, 18f, 14f, 18f) }
                ReferenceGlyph.Globe -> { circle(12f, 12f, 10f); path { moveTo(12f, 2f); cubicTo(5f, 7f, 5f, 17f, 12f, 22f); cubicTo(19f, 17f, 19f, 7f, 12f, 2f) }; line(3f, 8f, 21f, 8f); line(3f, 16f, 21f, 16f) }
                ReferenceGlyph.Refresh -> { path { moveTo(20f, 8f); cubicTo(16f, 0f, 4f, 2f, 3f, 11f); moveTo(4f, 16f); cubicTo(8f, 24f, 20f, 22f, 21f, 13f); moveTo(20f, 3f); lineTo(20f, 8f); lineTo(15f, 8f); moveTo(4f, 21f); lineTo(4f, 16f); lineTo(9f, 16f) } }
                ReferenceGlyph.Mic -> {
                    drawRoundRect(tint, Offset(8.5f, 2f), androidx.compose.ui.geometry.Size(7f, 13f), androidx.compose.ui.geometry.CornerRadius(3.5f), style = stroke)
                    path { moveTo(4.5f, 11f); cubicTo(4.5f, 21f, 19.5f, 21f, 19.5f, 11f) }; line(12f, 19f, 12f, 23f)
                }
                ReferenceGlyph.Wave -> listOf(7f, 13f, 20f, 9f, 15f).forEachIndexed { i, h -> line(4f + i * 4f, 12f - h / 2, 4f + i * 4f, 12f + h / 2) }
                ReferenceGlyph.Compose -> {
                    path { moveTo(11f, 4f); lineTo(6f, 4f); quadraticTo(3f, 4f, 3f, 7f); lineTo(3f, 19f); quadraticTo(3f, 21f, 6f, 21f); lineTo(18f, 21f); quadraticTo(21f, 21f, 21f, 18f); lineTo(21f, 14f) }
                    path { moveTo(10f, 15f); lineTo(11f, 10f); lineTo(19f, 2f); quadraticTo(20f, 1f, 22f, 3f); quadraticTo(23f, 4f, 22f, 5f); lineTo(14f, 13f); close() }
                }
                ReferenceGlyph.More -> listOf(4f, 12f, 20f).forEach { drawCircle(tint, 1.8f, Offset(12f, it)) }
                ReferenceGlyph.MoreHorizontal -> listOf(4f, 12f, 20f).forEach { drawCircle(tint, 1.8f, Offset(it, 12f)) }
                ReferenceGlyph.Person -> { circle(12f, 7f, 4f); path { moveTo(3f, 21f); lineTo(3f, 19f); cubicTo(3f, 12f, 21f, 12f, 21f, 19f); lineTo(21f, 21f) } }
                ReferenceGlyph.Settings -> { line(3f, 6f, 7f, 6f); circle(10f, 6f, 3f); line(13f, 6f, 21f, 6f); line(3f, 18f, 11f, 18f); circle(14f, 18f, 3f); line(17f, 18f, 21f, 18f) }
                ReferenceGlyph.SignOut -> { path { moveTo(10f, 3f); lineTo(5f, 3f); quadraticTo(3f, 3f, 3f, 5f); lineTo(3f, 19f); quadraticTo(3f, 21f, 5f, 21f); lineTo(10f, 21f); moveTo(16f, 7f); lineTo(21f, 12f); lineTo(16f, 17f) }; line(9f, 12f, 21f, 12f) }
                ReferenceGlyph.Eye, ReferenceGlyph.EyeOff -> { path { moveTo(2f, 12f); cubicTo(7f, 3f, 17f, 3f, 22f, 12f); cubicTo(17f, 21f, 7f, 21f, 2f, 12f); close() }; circle(12f, 12f, 3f); if (glyph == ReferenceGlyph.EyeOff) line(3f, 3f, 21f, 21f) }
                ReferenceGlyph.Copy -> { drawRoundRect(tint, Offset(3f, 7f), androidx.compose.ui.geometry.Size(13f, 14f), androidx.compose.ui.geometry.CornerRadius(3f), style = stroke); path { moveTo(8f, 7f); lineTo(8f, 5f); quadraticTo(8f, 2f, 11f, 2f); lineTo(18f, 2f); quadraticTo(21f, 2f, 21f, 5f); lineTo(21f, 14f); quadraticTo(21f, 17f, 18f, 17f); lineTo(16f, 17f) } }
                ReferenceGlyph.Share -> { circle(18f, 4f, 3f); circle(5f, 12f, 3f); circle(18f, 20f, 3f); line(8f, 10.5f, 15f, 5.5f); line(8f, 13.5f, 15f, 18.5f) }
                ReferenceGlyph.Folder -> path { moveTo(3f, 8f); lineTo(3f, 6f); quadraticTo(3f, 3f, 6f, 3f); lineTo(10f, 3f); lineTo(13f, 6f); lineTo(19f, 6f); quadraticTo(21f, 6f, 21f, 9f); lineTo(21f, 19f); quadraticTo(21f, 21f, 18f, 21f); lineTo(6f, 21f); quadraticTo(3f, 21f, 3f, 18f); close(); moveTo(3f, 10f); lineTo(21f, 10f) }
                ReferenceGlyph.Image -> { drawRoundRect(tint, Offset(3f, 3f), androidx.compose.ui.geometry.Size(18f, 18f), androidx.compose.ui.geometry.CornerRadius(3f), style = stroke); circle(15.5f, 8.5f, 2f); path { moveTo(3f, 16f); lineTo(8f, 11f); quadraticTo(9f, 10f, 10f, 11f); lineTo(19f, 21f) } }
                ReferenceGlyph.Camera -> { path { moveTo(3f, 7f); lineTo(7f, 7f); lineTo(9f, 4f); lineTo(15f, 4f); lineTo(17f, 7f); lineTo(21f, 7f); lineTo(21f, 20f); lineTo(3f, 20f); close() }; circle(12f, 13f, 4f) }
                ReferenceGlyph.Paperclip -> path { moveTo(9f, 8f); lineTo(9f, 16f); cubicTo(9f, 20f, 15f, 20f, 15f, 16f); lineTo(15f, 5f); cubicTo(15f, 0f, 6f, 0f, 6f, 5f); lineTo(6f, 16f); cubicTo(6f, 24f, 19f, 24f, 19f, 16f); lineTo(19f, 8f) }
                ReferenceGlyph.Clock -> { circle(12f, 12f, 10f); path { moveTo(12f, 5f); lineTo(12f, 12f); lineTo(8f, 16f) } }
                ReferenceGlyph.Plugin -> { circle(12f, 12f, 10f); path { moveTo(7f, 14f); lineTo(11f, 10f); lineTo(14f, 13f); lineTo(17f, 10f); lineTo(14f, 7f); lineTo(10f, 11f); lineTo(13f, 14f); lineTo(10f, 17f); close() } }
                ReferenceGlyph.Reasoning -> { path { moveTo(4f, 19f); cubicTo(-1f, 9f, 8f, 1f, 17f, 5f); moveTo(20f, 9f); quadraticTo(24f, 14f, 20f, 20f) }; circle(12f, 13f, 3f); line(13.5f, 11f, 20f, 4f) }
                ReferenceGlyph.Pin -> path { moveTo(14f, 2f); lineTo(21f, 9f); lineTo(16f, 10f); lineTo(13f, 16f); lineTo(8f, 16f); lineTo(8f, 11f); close(); moveTo(8f, 16f); lineTo(3f, 22f) }
                ReferenceGlyph.Archive -> { drawRoundRect(tint, Offset(4f, 7f), androidx.compose.ui.geometry.Size(16f, 14f), androidx.compose.ui.geometry.CornerRadius(3f), style = stroke); drawRoundRect(tint, Offset(2f, 3f), androidx.compose.ui.geometry.Size(20f, 5f), androidx.compose.ui.geometry.CornerRadius(2f), style = stroke); line(9f, 13f, 15f, 13f) }
                ReferenceGlyph.Trash -> { path { moveTo(5f, 7f); lineTo(6f, 20f); lineTo(18f, 20f); lineTo(19f, 7f); moveTo(3f, 6f); lineTo(21f, 6f); moveTo(8f, 6f); lineTo(9f, 2f); lineTo(15f, 2f); lineTo(16f, 6f) }; line(10f, 10f, 10f, 16f); line(14f, 10f, 14f, 16f) }
                ReferenceGlyph.Check -> path { moveTo(4f, 12f); lineTo(9f, 18f); lineTo(21f, 4f) }
                ReferenceGlyph.ThumbUp, ReferenceGlyph.ThumbDown -> {
                    scale(1f, if (glyph == ReferenceGlyph.ThumbDown) -1f else 1f, pivot = Offset(12f, 12f)) {
                        drawPath(Path().apply { moveTo(8f, 10f); lineTo(12f, 3f); quadraticTo(13f, 1f, 15f, 3f); lineTo(15f, 9f); lineTo(20f, 9f); quadraticTo(22f, 9f, 21f, 13f); lineTo(19f, 21f); lineTo(8f, 21f); close(); moveTo(3f, 10f); lineTo(6f, 10f); lineTo(6f, 21f); lineTo(3f, 21f); close() }, tint, style = stroke)
                    }
                }
                ReferenceGlyph.Speaker -> { path { moveTo(3f, 9f); lineTo(7f, 9f); lineTo(12f, 4f); lineTo(12f, 20f); lineTo(7f, 15f); lineTo(3f, 15f); close(); moveTo(16f, 8f); quadraticTo(20f, 12f, 16f, 16f); moveTo(20f, 5f); quadraticTo(26f, 12f, 20f, 19f) } }
            }
        }
    }
}
