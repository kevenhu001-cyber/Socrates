package com.socrates.android.ui

/** Keep a single PDF bitmap below 1440×2048 (about 12 MB ARGB), even for unusual page sizes. */
object PdfPageSizing {
    fun fit(width: Int, height: Int): Pair<Int, Int> {
        require(width > 0 && height > 0) { "PDF 页面尺寸无效。" }
        val scale = minOf(1440.0 / width, 2048.0 / height)
        return (width * scale).toInt().coerceIn(1, 1440) to
            (height * scale).toInt().coerceIn(1, 2048)
    }
}
