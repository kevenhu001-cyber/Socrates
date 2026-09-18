package com.topodrive.socrates.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * Lucide/feather-style icon set ported 1:1 from the SVG `path` data used by
 * `frontend/index.html` and the web component tree. Stroke icons are drawn
 * in black; callers apply `Icon(tint = …)` to reproduce `currentColor`.
 */
private fun strokeIcon(vararg d: String, strokeWidth: Float = 2f): ImageVector =
    ImageVector.Builder(
        name = "socrates",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).apply {
        for (path in d) {
            addPath(
                pathData = addPathNodes(path),
                fill = null,
                stroke = SolidColor(Color.Black),
                strokeLineWidth = strokeWidth,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
    }.build()

private fun fillIcon(vararg d: String): ImageVector =
    ImageVector.Builder(
        name = "socrates-fill",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).apply {
        for (path in d) {
            addPath(pathData = addPathNodes(path), fill = SolidColor(Color.Black))
        }
    }.build()

object SocIcons {
    /** Pencil-square — sidebar "New chat" + header compose button. */
    val Edit = strokeIcon("M12 20h9", "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z")
    /** Panel-left — "close sidebar". */
    val PanelLeft = strokeIcon("M3 3h18v18H3z", "M9 3v18")
    /** Projects nav — three rule lines, last one shorter. */
    val Projects = strokeIcon("M3 7h18", "M3 12h18", "M3 17h12")
    /** Book — "Artifacts/Library" nav. */
    val Book = strokeIcon(
        "M4 19.5A2.5 2.5 0 0 1 6.5 17H20",
        "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
    )
    /** Calendar — "Scheduled". */
    val Calendar = strokeIcon("M3 4h18v18H3z", "M16 2v4", "M8 2v4", "M3 10h18")
    /** Plugins — connector bricks. */
    val Plugins = strokeIcon("M2 5h20v14H2z", "M5 10h6v4H5z", "M13 10h6v4h-6z", strokeWidth = 1.8f)
    /** Check-square — "Exam". */
    val Exam = strokeIcon("M9 11l3 3 8-8", "M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9")
    /** Grid-plus — "Skills & shortcuts". */
    val Skills = strokeIcon(
        "M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z",
        "M17 14v6", "M14 17h6",
    )
    /** Ellipsis — "More". */
    val More = fillIcon(
        "M5 10.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z",
        "M12 10.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z",
        "M19 10.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z",
    )
    val Search = strokeIcon("M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0", "m21 21-4.3-4.3")
    /** Knowledge graph — three nodes + edges. */
    val Knowledge = strokeIcon(
        "M5.5 6m-2.1 0a2.1 2.1 0 1 0 4.2 0a2.1 2.1 0 1 0-4.2 0",
        "M18 7.5m-2.1 0a2.1 2.1 0 1 0 4.2 0a2.1 2.1 0 1 0-4.2 0",
        "M12 18m-2.1 0a2.1 2.1 0 1 0 4.2 0a2.1 2.1 0 1 0-4.2 0",
        "M7.5 6.5h8.4", "M6.7 7.9l4.6 8.2", "M16.7 9.4l-3.9 6.9",
    )
    /** Bookmark — "Mistake book". */
    val Bookmark = strokeIcon("M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z")
    val Sun = strokeIcon(
        "M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0",
        "M12 1v2", "M12 21v2", "M4.22 4.22l1.42 1.42", "M18.36 18.36l1.42 1.42",
        "M1 12h2", "M21 12h2", "M4.22 19.78l1.42-1.42", "M18.36 5.64l1.42-1.42",
    )
    val Moon = strokeIcon("M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z")
    /** Sliders — display preferences. */
    val Sliders = strokeIcon(
        "M21 6h-7", "M10 6H3", "M21 12h-9", "M8 12H3", "M21 18h-5", "M12 18H3",
    )
    /** Gear — API settings. */
    val Gear = strokeIcon(
        "M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
        "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    )
    /** Menu — top-left sidebar open. */
    val Menu = strokeIcon("M6 9h12", "M6 15h8", strokeWidth = 2.2f)
    /** Incognito — hat and glasses. */
    val Incognito = strokeIcon(
        "M6.5 10.5 8.3 6c.2-.6.9-.9 1.5-.7l2.2.7 2.2-.7c.6-.2 1.3.1 1.5.7l1.8 4.5",
        "M4 10.5h16",
        "M8.5 15.5m-2.7 0a2.7 2.7 0 1 0 5.4 0a2.7 2.7 0 1 0-5.4 0",
        "M15.5 15.5m-2.7 0a2.7 2.7 0 1 0 5.4 0a2.7 2.7 0 1 0-5.4 0",
        "M11.2 15.5h1.6",
        strokeWidth = 1.8f,
    )
    val CaretDown = strokeIcon("m7 10 5 5 5-5")
    val ChevronDown = strokeIcon("M6 9l6 6 6-6")
    val ChevronUp = strokeIcon("M18 15l-6-6-6 6")
    val ChevronRight = strokeIcon("m9 18 6-6-6-6")
    val Plus = strokeIcon("M12 5v14", "M5 12h14")
    val Mic = strokeIcon("M9 3h6v11a3 3 0 0 1-6 0z", "M5 11a7 7 0 0 0 14 0", "M12 18v3", "M8 21h8")
    /** Voice waveform bars — the send button's idle-state glyph. */
    val VoiceBars = strokeIcon("M4 10v4", "M8 7v10", "M12 5v14", "M16 8v8", "M20 10v4")
    /** Share — box with arrow up out of it. */
    val Share = strokeIcon("M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8", "M16 6l-4-4-4 4", "M12 2v15")
    val Close = strokeIcon("M18 6 6 18", "M6 6l12 12")
    val ArrowLeft = strokeIcon("M19 12H5", "M12 19l-7-7 7-7")
    val ArrowUp = strokeIcon("M12 19V5", "M5 12l7-7 7 7")
    val ArrowDown = strokeIcon("M12 5v14", "M19 12l-7 7-7-7")
    /** GitHub mark (filled). */
    val GitHub = fillIcon(
        "M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.92.58.1.79-.25.79-.56v-2.16c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.39.97.1-.76.4-1.27.74-1.56-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.28 1.2-3.09-.12-.3-.52-1.49.11-3.1 0 0 .98-.31 3.2 1.18a11.2 11.2 0 0 1 5.84 0c2.22-1.49 3.2-1.18 3.2-1.18.63 1.61.23 2.8.11 3.1.75.81 1.2 1.83 1.2 3.09 0 4.43-2.7 5.4-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z",
    )
    /** Envelope — verify / forgot-password icons. */
    val Mail = strokeIcon("M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M22 6l-10 7L2 6", strokeWidth = 1.6f)
    val Check = strokeIcon("M20 6L9 17l-5-5")
    val Lock = strokeIcon("M3 11h18v11H3z", "M7 11V7a5 5 0 0 1 10 0v4", strokeWidth = 1.6f)
    val AlertCircle = strokeIcon("M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0", "M12 8v4", "M12 16h.01", strokeWidth = 1.6f)
    /** Code-login icon (terminal card). */
    val CodeLogin = strokeIcon("M2 4h20v16H2z", "M12 11v4", "M12 8h.01", strokeWidth = 1.6f)
    val Pin = strokeIcon("M12 17v5", "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V5h1a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2h1z")
    val Archive = strokeIcon("M3 4h18v4H3z", "M5 8v12h14V8", "M10 12h4")
    val Trash = strokeIcon("M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", "M10 11v6", "M14 11v6")
    val Pencil = strokeIcon("M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z")
    val Copy = strokeIcon("M9 9h13v13H9z", "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1")
    val Refresh = strokeIcon("M3 12a9 9 0 0 1 15.5-6.36L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-15.5 6.36L3 16", "M3 21v-5h5")
    val ThumbsUp = strokeIcon("M7 10v12", "M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z")
    val ThumbsDown = strokeIcon("M17 14V2", "M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88z")
    val Volume = strokeIcon("M11 5 6 9H2v6h4l5 4z", "M15.54 8.46a5 5 0 0 1 0 7.07", "M19.07 4.93a10 10 0 0 1 0 14.14")
    val Stop = fillIcon("M6 6h12v12H6z")
    val Camera = strokeIcon("M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z", "M12 13m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0")
    val Image = strokeIcon("M3 4h17v16H3z", "M8.5 9m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0", "m5.5 17 4.5-4.5 3.2 3.2 2.2-2.2 3.1 3.5", strokeWidth = 1.8f)
    val FileText = strokeIcon("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M16 13H8", "M16 17H8", "M10 9H8")
    val Link = strokeIcon("M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71", "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71")
    val Download = strokeIcon("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3")
    val Upload = strokeIcon("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M17 8l-5-5-5 5", "M12 3v12")
    val LogOut = strokeIcon("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9")
    val User = strokeIcon("M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M12 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0")
    val Send = strokeIcon("M22 2 11 13", "M22 2l-7 20-4-9-9-4z")
    val Globe = strokeIcon("M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0", "M2 12h20", "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z")
    val Zap = strokeIcon("M13 2 3 14h9l-1 8 10-12h-9l1-8z")
    val Folder = strokeIcon("M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z")
    val Clock = strokeIcon("M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0", "M12 6v6l4 2")
    val Tag = strokeIcon("M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l8.58-8.58a1 1 0 0 0 0-1.42z", "M7 7h.01")
    val MessageSquare = strokeIcon("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z")
    val Sparkles = strokeIcon("M9.94 15.5a2 2 0 0 0-1.44-1.44L2.37 12.5a.51.51 0 0 1 0-.98l6.13-1.56a2 2 0 0 0 1.44-1.44l1.56-6.13a.51.51 0 0 1 .98 0l1.56 6.13a2 2 0 0 0 1.44 1.44l6.13 1.56a.51.51 0 0 1 0 .98l-6.13 1.56a2 2 0 0 0-1.44 1.44l-1.56 6.13a.51.51 0 0 1-.98 0z", "M20 3v4", "M22 5h-4", "M4 17v2", "M5 18H3")
    val Cpu = strokeIcon("M4 4h16v16H4z", "M9 9h6v6H9z", "M15 2v2", "M15 20v2", "M2 15h2", "M2 9h2", "M20 15h2", "M20 9h2", "M9 2v2", "M9 20v2")
    val Info = strokeIcon("M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0", "M12 16v-4", "M12 8h.01")
    val ExternalLink = strokeIcon("M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6")
    val Play = fillIcon("M6 4l14 8-14 8z")
    val Eye = strokeIcon("M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z", "M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0")
    val EyeOff = strokeIcon("M9.88 9.88a3 3 0 1 0 4.24 4.24", "M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68", "M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61", "M2 2l20 20")
    val EditWrite = strokeIcon("m4 20 4.2-1L18.8 8.4a2.1 2.1 0 0 0-3-3L5.2 16z", "m14.8 6.2 3 3", strokeWidth = 1.8f)
    val Research = strokeIcon("M11 11m-6.5 0a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0", "m16 16 4.5 4.5", "M11 7.5v7", "M7.5 11h7", strokeWidth = 1.8f)
    val KeyRound = strokeIcon(
        "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z",
        "M16.5 7.5h.01",
    )
    val Wrench = strokeIcon("M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z")
    /** Atom-ish orbit mark used for tool runs. */
    val ToolRun = strokeIcon("M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0", "M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z", "M16 8 2 22", "M17.5 15H9")
    val Palette = strokeIcon("M12 22a10 10 0 1 1 10-10c0 4.9-3.4 5.5-4.5 5.5h-2a2 2 0 0 0-1.5 3.3c.4.5.5 1.2-.3 1.2z", "M7.5 10.5h.01", "M12 7.5h.01", "M16.5 10.5h.01", "M16 15.5h.01")
}
