package com.socrates.android.data

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import java.io.ByteArrayOutputStream

object AttachmentImage {
    /** Bound both decoded pixels and wire bytes; server accepts at most 2,000,000 data-URL chars. */
    fun dataUrl(bytes: ByteArray): String {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        require(bounds.outWidth > 0 && bounds.outHeight > 0) { "无法读取此图片格式。" }
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 2048) sample *= 2
        var bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: error("图片解码失败")
        try {
            while (true) {
                for (quality in listOf(88, 72, 55, 35)) {
                    val output = ByteArrayOutputStream()
                    require(bitmap.compress(Bitmap.CompressFormat.JPEG, quality, output)) { "图片压缩失败" }
                    val encoded = "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
                    if (encoded.length <= 2_000_000) return encoded
                }
                require(bitmap.width > 128 && bitmap.height > 128) { "图片太大，无法处理。" }
                val smaller = Bitmap.createScaledBitmap(bitmap, bitmap.width / 2, bitmap.height / 2, true)
                bitmap.recycle(); bitmap = smaller
            }
        } finally { bitmap.recycle() }
    }
}
