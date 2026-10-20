package com.socrates.android.ui

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.socrates.android.data.VoiceLanguage

/** Uses the installed Android recognition service; never fabricates a transcript or waveform. */
class VoiceInput(private val context: Context, private val onError: (String) -> Unit) {
    var active by mutableStateOf(false); private set
    var listening by mutableStateOf(false); private set
    var transcript by mutableStateOf(""); private set
    var amplitude by mutableFloatStateOf(0f); private set
    private var recognizer: SpeechRecognizer? = null
    private var pendingSend: ((String) -> Unit)? = null

    fun start(language: VoiceLanguage = VoiceLanguage.AUTO) {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            onError("此设备未安装语音识别服务，请启用系统语音输入后重试。"); return
        }
        cancel()
        active = true; listening = true; transcript = ""
        try {
            recognizer = SpeechRecognizer.createSpeechRecognizer(context).also { service ->
            service.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) { amplitude = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f) }
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() { listening = false; amplitude = 0f }
                override fun onError(error: Int) {
                    listening = false; amplitude = 0f
                    if (!active) return
                    pendingSend = null
                    if (transcript.isBlank()) {
                        active = false
                        onError(when (error) {
                            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "需要麦克风权限才能录音。"
                            SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "语音识别网络不可用，请重试。"
                            SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "没有识别到语音，请再试一次。"
                            else -> "语音识别未完成（$error），请重试。"
                        })
                    }
                }
                override fun onResults(results: Bundle?) {
                    transcript = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                    listening = false; amplitude = 0f
                    val callback = pendingSend; pendingSend = null
                    if (callback != null && transcript.isNotBlank()) { val text = transcript; cancel(); callback(text) }
                }
                override fun onPartialResults(results: Bundle?) {
                    transcript = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                }
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
            service.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, language.recognitionTag())
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            })
            }
        } catch (_: Exception) {
            cancel()
            onError("无法启动系统语音识别服务，请检查麦克风权限及系统语音设置。")
        }
    }
    fun stop() { recognizer?.stopListening(); listening = false; amplitude = 0f }
    fun send(callback: (String) -> Unit) {
        if (listening) { pendingSend = callback; stop() }
        else if (transcript.isNotBlank()) { val text = transcript; cancel(); callback(text) }
        else onError("正在等待识别结果，请稍后再发送。")
    }
    fun cancel() {
        active = false; listening = false; amplitude = 0f; pendingSend = null
        recognizer?.cancel(); recognizer?.destroy(); recognizer = null
    }
}
