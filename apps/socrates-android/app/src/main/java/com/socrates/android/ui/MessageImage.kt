package com.socrates.android.ui

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Only the existing message data-URL contract is decoded; never leak auth to remote image URLs. */
@Composable
internal fun MessageImage(dataUrl: String, description: String) {
    val bitmap by produceState<ImageBitmap?>(null, dataUrl) {
        value = withContext(Dispatchers.Default) {
            runCatching {
                require(dataUrl.length <= 12 * 1024 * 1024)
                val comma = dataUrl.indexOf(',')
                require(comma in 1..100 && dataUrl.startsWith("data:image/") && dataUrl.substring(0, comma).endsWith(";base64"))
                val bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
                require(bytes.size <= 8 * 1024 * 1024)
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                require(bounds.outWidth > 0 && bounds.outHeight > 0)
                var sample = 1
                while (bounds.outWidth / sample > 1024 || bounds.outHeight / sample > 1024) sample *= 2
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })?.asImageBitmap()
            }.getOrNull()
        }
    }
    val image = bitmap
    if (image != null) Image(image, description, Modifier.fillMaxWidth().heightIn(max = 320.dp).clip(RoundedCornerShape(18.dp)), contentScale = ContentScale.Fit)
    else Text("图片附件 · $description", Modifier.padding(vertical = 8.dp))
}
