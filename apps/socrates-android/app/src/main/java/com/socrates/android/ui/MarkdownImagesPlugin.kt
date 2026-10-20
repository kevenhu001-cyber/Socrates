package com.socrates.android.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.BitmapDrawable
import android.net.Uri
import android.util.Base64
import io.noties.markwon.image.ImagesPlugin
import io.noties.markwon.image.MediaDecoder
import io.noties.markwon.image.SchemeHandler
import io.noties.markwon.image.ImageItem
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.CookieJar
import okhttp3.Dns
import java.util.concurrent.TimeUnit
import java.util.Collections
import java.util.Locale
import java.util.concurrent.Executors
import java.net.InetAddress

/** Secure, bounded image loading for NativeMarkdown; install alongside (not instead of) other plugins. */
internal object MarkdownImagesPlugin {
    private const val MAX_BYTES = 8 * 1024 * 1024
    private const val MAX_EDGE = 2048
    private const val MAX_PIXELS = 4_194_304
    private val ioExecutor = Executors.newFixedThreadPool(2) { task ->
        Thread(task, "markdown-image-io").apply { isDaemon = true }
    }

    /** Add `.usePlugin(MarkdownImagesPlugin.create(context))` to the existing Markwon builder. */
    fun create(context: Context): ImagesPlugin = ImagesPlugin.create { plugin ->
        plugin.executorService(ioExecutor)
            .addSchemeHandler(DataImageHandler())
            .addSchemeHandler(HttpsImageHandler())
            .defaultMediaDecoder(BoundedBitmapDecoder(context.applicationContext))
            .errorHandler { _, _ -> null }
    }

    private class DataImageHandler : SchemeHandler() {
        override fun supportedSchemes() = Collections.singleton("data")

        override fun handle(raw: String, uri: Uri): ImageItem {
            require(raw.length <= ((MAX_BYTES * 4L / 3L) + 256L)) { "Image data URI exceeds limit" }
            val comma = raw.indexOf(',')
            require(comma > 0) { "Malformed image data URI" }
            require(raw.startsWith("data:", ignoreCase = true))
            val header = raw.substring(5, comma)
            val mime = header.substringBefore(';').lowercase(Locale.ROOT)
            require(mime.startsWith("image/") && header.substringAfter(';', "") == "base64") {
                "Only base64 image data URIs are supported"
            }
            val payload = raw.substring(comma + 1)
            require(payload.all { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it == '+' || it == '/' || it == '=' || it.isWhitespace() }) {
                "Invalid base64 image"
            }
            val bytes = try { Base64.decode(payload, Base64.DEFAULT) }
            catch (e: IllegalArgumentException) { throw IOException("Invalid base64 image", e) }
            require(bytes.isNotEmpty() && bytes.size <= MAX_BYTES) { "Image data URI exceeds limit" }
            return ImageItem.withDecodingNeeded(mime, ByteArrayInputStream(bytes))
        }
    }

    private class HttpsImageHandler : SchemeHandler() {
        override fun supportedSchemes() = Collections.singleton("https")

        override fun handle(raw: String, uri: Uri): ImageItem {
            require(uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank()) {
                "Only public HTTPS image URLs are supported"
            }
            require(uri.userInfo == null) { "Credentials in image URLs are not allowed" }
            val bytes = readHttps(raw)
            return ImageItem.withDecodingNeeded(null, ByteArrayInputStream(bytes))
        }
    }

    private class BoundedBitmapDecoder(context: Context) : MediaDecoder() {
        private val resources = context.resources
        override fun supportedTypes(): Collection<String> = emptySet()

        override fun decode(contentType: String?, inputStream: InputStream): BitmapDrawable {
            val bytes = readBounded(inputStream, MAX_BYTES)
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            require(bounds.outWidth > 0 && bounds.outHeight > 0) { "Unsupported or invalid raster image" }
            var sample = 1
            while (bounds.outWidth / sample > MAX_EDGE || bounds.outHeight / sample > MAX_EDGE ||
                bounds.outWidth.toLong() * bounds.outHeight / (sample.toLong() * sample) > MAX_PIXELS) {
                sample *= 2
            }
            val options = BitmapFactory.Options().apply { inSampleSize = sample }
            val bitmap: Bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
                ?: throw IOException("Could not decode image")
            require(bitmap.width <= MAX_EDGE && bitmap.height <= MAX_EDGE &&
                bitmap.width.toLong() * bitmap.height <= MAX_PIXELS) { "Decoded image exceeds dimensions limit" }
            return BitmapDrawable(resources, bitmap)
        }
    }

    // This separate client has no account authenticator, interceptor or cookie store.
    // DNS is validated in the actual connection lookup, not in a separate rebinding-prone preflight.
    private val publicClient = OkHttpClient.Builder()
        .followRedirects(false).followSslRedirects(false).cookieJar(CookieJar.NO_COOKIES)
        .connectTimeout(12, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS)
        .callTimeout(30, TimeUnit.SECONDS)
        .dns(object : Dns {
            override fun lookup(hostname: String): List<InetAddress> {
                val host = hostname.trim('[', ']').lowercase(Locale.ROOT)
                require(host != "localhost" && !host.endsWith(".localhost") && !host.endsWith(".local"))
                return Dns.SYSTEM.lookup(host).also { addresses ->
                    require(addresses.isNotEmpty() && addresses.all { address ->
                        val bytes = address.address
                        !address.isAnyLocalAddress && !address.isLoopbackAddress && !address.isLinkLocalAddress &&
                            !address.isSiteLocalAddress && !address.isMulticastAddress &&
                            !(bytes.size == 16 && (bytes[0].toInt() and 0xfe) == 0xfc) &&
                            !(bytes.size == 4 && (bytes[0].toInt() and 0xff) == 100 && (bytes[1].toInt() and 0xc0) == 64)
                    }) { "Private image hosts are not allowed" }
                }
            }
        }).build()

    private fun readHttps(raw: String): ByteArray {
        val request = Request.Builder().url(raw).header("Accept", "image/*").build()
        require(request.url.isHttps && request.url.username.isEmpty() && request.url.password.isEmpty())
        return publicClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("Image request failed (HTTP ${response.code})")
            val body = response.body ?: throw IOException("Empty image")
            if (body.contentLength() > MAX_BYTES) throw IOException("Image exceeds 8 MiB limit")
            body.byteStream().use { readBounded(it, MAX_BYTES) }
        }
    }

    private fun readBounded(input: InputStream, limit: Int): ByteArray {
        val output = ByteArrayOutputStream(minOf(limit, 32 * 1024))
        val buffer = ByteArray(8192)
        var total = 0
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            total += count
            if (total > limit) throw IOException("Image exceeds 8 MiB limit")
            output.write(buffer, 0, count)
        }
        if (total == 0) throw IOException("Empty image")
        return output.toByteArray()
    }
}
