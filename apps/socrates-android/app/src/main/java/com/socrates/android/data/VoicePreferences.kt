package com.socrates.android.data

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import java.util.Locale

/** Account preference whitelist, shared with users.ts; auto follows the device, not language detection. */
enum class VoiceLanguage(val wire: String, val label: String) {
    AUTO("auto", "自动（跟随设备语言）"), CHINESE("zh-CN", "中文"), ENGLISH("en-US", "English");
    fun recognitionTag(device: Locale = Locale.getDefault()): String = if (this == AUTO)
        device.toLanguageTag().takeUnless { it.isBlank() || it == "und" } ?: "en-US" else wire
    companion object {
        fun parse(value: Any?): VoiceLanguage = entries.firstOrNull { it.wire == value }
            ?: throw IllegalStateException("服务器返回了不支持的语音语言，请重新读取后再试。")
    }
}
class VoicePreferencesRepository(private val request: (String, String, JSONObject?) -> JSONObject) {
    private fun read(response: JSONObject): VoiceLanguage {
        val prefs = response.optJSONObject("preferences") ?: error("服务器未返回有效偏好，请重新读取。")
        return if (!prefs.has("voiceLanguage")) VoiceLanguage.AUTO else VoiceLanguage.parse(prefs.opt("voiceLanguage"))
    }
    fun load(): VoiceLanguage = read(request("GET", "users/me/preferences", null))
    fun save(language: VoiceLanguage): VoiceLanguage {
        val response = request("PATCH", "users/me/preferences", JSONObject().put("voiceLanguage", language.wire))
        check(response.optJSONObject("preferences")?.has("voiceLanguage") == true) { "服务器未确认语音语言，请重新读取核对。" }
        val confirmed = read(response)
        check(confirmed == language) { "服务器未确认所选语音语言，请重新读取核对。" }
        return confirmed
    }
}
data class VoicePreferencesState(
    val confirmed: VoiceLanguage? = null, val selected: VoiceLanguage = VoiceLanguage.AUTO,
    val loading: Boolean = false, val saving: Boolean = false, val needsRefresh: Boolean = false,
    val error: String? = null, val message: String? = null,
) {
    val dirty: Boolean get() = confirmed != null && selected != confirmed
    val canEdit: Boolean get() = confirmed != null && !loading && !saving && !needsRefresh
    val canSave: Boolean get() = canEdit && dirty
    val canRecord: Boolean get() = confirmed != null && !loading && !saving && !needsRefresh
}
/** Keeps confirmed account data only in memory. Generations also reject non-cooperative late IO. */
class VoicePreferencesController(
    private val scope: CoroutineScope,
    private val loadPreference: suspend () -> VoiceLanguage,
    private val savePreference: suspend (VoiceLanguage) -> VoiceLanguage,
    private val onAuthLost: () -> Unit = {},
) {
    private val mutable = MutableStateFlow(VoicePreferencesState())
    val state = mutable.asStateFlow()
    private var job: Job? = null
    private var generation = 0L
    @Synchronized fun clear() {
        generation++; job?.cancel(); job = null
        mutable.value = VoicePreferencesState()
    }
    @Synchronized fun dismiss() {
        generation++; job?.cancel(); job = null
        val before = mutable.value
        mutable.value = before.copy(selected = before.confirmed ?: VoiceLanguage.AUTO, loading = false, saving = false,
            needsRefresh = before.needsRefresh || before.saving, message = null)
    }
    @Synchronized fun edit(language: VoiceLanguage) {
        if (mutable.value.canEdit) mutable.value = mutable.value.copy(selected = language, error = null, message = null)
    }
    @Synchronized fun load() {
        if (mutable.value.saving) return
        val epoch = ++generation
        job?.cancel()
        mutable.value = mutable.value.copy(loading = true, error = null, message = null)
        job = scope.launch {
            try {
                val value = loadPreference()
                ensureActive()
                publish(epoch) { VoicePreferencesState(confirmed = value, selected = value) }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { failed(epoch, e, writing = false) }
        }
    }
    @Synchronized fun save() {
        val before = mutable.value
        if (!before.canSave) return
        val epoch = ++generation
        job?.cancel()
        mutable.value = before.copy(saving = true, error = null, message = null)
        job = scope.launch {
            try {
                val value = savePreference(before.selected)
                ensureActive()
                check(value == before.selected) { "服务器未确认所选语音语言。" }
                publish(epoch) { VoicePreferencesState(confirmed = value, selected = value, message = "已保存到账号，下次录音生效。") }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { failed(epoch, e, writing = true) }
        }
    }
    @Synchronized private fun failed(epoch: Long, error: Exception, writing: Boolean) {
        if (epoch != generation) return
        if (error is ApiException && error.statusCode == 401) {
            clear(); onAuthLost(); return
        }
        mutable.value = mutable.value.copy(loading = false, saving = false, needsRefresh = true,
            error = if (writing) "保存结果未确认，服务器可能已处理。请先重新读取核对，不会自动重发。" else "无法读取账号语音偏好，请重试。")
    }
    @Synchronized private fun publish(epoch: Long, update: (VoicePreferencesState) -> VoicePreferencesState) {
        if (epoch == generation) mutable.value = update(mutable.value)
    }
}
