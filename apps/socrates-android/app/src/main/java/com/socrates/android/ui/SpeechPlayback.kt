package com.socrates.android.ui

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import android.os.Handler
import android.os.Looper
import java.util.Locale

/** Device TTS, not a claim of realtime voice chat or server-generated audio. */
internal class SpeechPlayback(context: Context, private val onError: (String) -> Unit) {
    var playingId: String? by mutableStateOf(null)
        private set
    private val handler = Handler(Looper.getMainLooper())
    private var ready = false
    private var disposed = false
    private var engine: TextToSpeech? = TextToSpeech(context.applicationContext) { status ->
        handler.post { if (!disposed) ready = status == TextToSpeech.SUCCESS }
    }
    init {
        engine?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = Unit
            override fun onDone(utteranceId: String?) { handler.post { if (playingId == utteranceId) playingId = null } }
            @Deprecated("Platform callback")
            override fun onError(utteranceId: String?) { handler.post { if (!disposed && playingId == utteranceId) { playingId = null; onError("无法朗读此回复，请检查系统语音设置。") } } }
        })
    }
    fun toggle(id: String, markdown: String) {
        if (playingId == id) { stop(); return }
        if (!ready || disposed) { onError("系统朗读服务尚未就绪，请稍后再试。 "); return }
        val language = if (markdown.any { it.code in 0x4E00..0x9FFF }) Locale.SIMPLIFIED_CHINESE else Locale.getDefault()
        val support = engine?.setLanguage(language) ?: TextToSpeech.LANG_NOT_SUPPORTED
        if (support == TextToSpeech.LANG_MISSING_DATA || support == TextToSpeech.LANG_NOT_SUPPORTED) {
            onError("系统未安装此语言的朗读语音，请在设备语音设置中安装。 "); return
        }
        // Keep the message intact. Paragraphs are queued within the platform text limit.
        val chunks = markdown.chunked(TextToSpeech.getMaxSpeechInputLength())
        engine?.stop()
        playingId = id
        chunks.forEachIndexed { index, text ->
            val utterance = if (index == chunks.lastIndex) id else "$id:$index"
            val status = engine?.speak(text, if (index == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD, null, utterance)
            if (status == TextToSpeech.ERROR) { stop(); onError("系统朗读失败，请检查语音设置。"); return }
        }
    }
    fun stop() { engine?.stop(); playingId = null }
    fun dispose() { disposed = true; stop(); engine?.shutdown(); engine = null }
}
