package com.socrates.android.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Collection-qualified identity prevents equal IDs in files and artifacts colliding. */
data class LibraryResourceKey(val collection: String, val id: String) {
    companion object {
        private val validId = Regex("[A-Za-z0-9_-]{1,128}")
        fun from(item: FeatureItem): LibraryResourceKey? {
            val collection = if (!item.raw.has("_collection") || item.raw.isNull("_collection")) "files"
                else item.raw.optString("_collection", "files").ifBlank { "files" }
            if (collection != "files" && collection != "artifacts") return null
            if (!validId.matches(item.id)) return null
            return LibraryResourceKey(collection, item.id)
        }
    }
}

data class LibrarySelectionState(
    val selection: Set<LibraryResourceKey> = emptySet(),
    val confirmation: List<LibraryResourceKey>? = null,
    val busy: Boolean = false,
    val succeeded: Int = 0,
    val failures: Map<LibraryResourceKey, String> = emptyMap(),
    val notice: String? = null,
)

/** UI-independent state holder. Delete operations are sequential and fenced against stale jobs. */
class LibrarySelectionController(
    private val scope: CoroutineScope,
    private val delete: suspend (LibraryResourceKey) -> Unit,
    private val onDeleted: (LibraryResourceKey) -> Unit,
    private val onUnauthorized: () -> Unit,
) {
    private val _state = MutableStateFlow(LibrarySelectionState())
    val state: StateFlow<LibrarySelectionState> = _state.asStateFlow()
    private var deleteJob: Job? = null
    private var generation = 0L

    fun toggle(item: FeatureItem) {
        if (_state.value.busy) return
        val key = LibraryResourceKey.from(item) ?: return
        val old = _state.value
        val selected = old.selection.toMutableSet()
        if (!selected.add(key)) selected.remove(key)
        _state.value = old.copy(selection = selected, failures = old.failures - key, notice = null)
    }

    /** Selects exactly this visible subset; if it is already wholly selected, deselects it. */
    fun selectVisible(items: List<FeatureItem>) {
        if (_state.value.busy) return
        val visible = items.mapNotNull(LibraryResourceKey::from).toSet()
        val old = _state.value
        val selected = old.selection.toMutableSet()
        if (visible.isNotEmpty() && visible.all { it in selected }) selected.removeAll(visible)
        else selected.addAll(visible)
        _state.value = old.copy(selection = selected, failures = old.failures - visible, notice = null)
    }

    fun reconcile(items: List<FeatureItem>) {
        if (_state.value.busy) return
        val present = items.mapNotNull(LibraryResourceKey::from).toSet()
        val old = _state.value
        _state.value = old.copy(selection = old.selection intersect present, failures = old.failures.filterKeys { it in present })
    }

    fun clearSelection() {
        if (_state.value.busy) return
        _state.value = _state.value.copy(selection = emptySet(), failures = emptyMap(), notice = null)
    }

    fun requestDelete() {
        val old = _state.value
        if (old.busy || old.confirmation != null) return
        val snapshot = old.selection.toList()
        if (snapshot.isNotEmpty()) _state.value = old.copy(confirmation = snapshot)
    }

    fun cancelDelete() {
        if (_state.value.busy) return
        _state.value = _state.value.copy(confirmation = null)
    }

    fun deleteConfirmed() {
        val old = _state.value
        val snapshot = old.confirmation ?: return
        if (old.busy || snapshot.isEmpty()) return
        val token = ++generation
        _state.value = old.copy(confirmation = null, busy = true, succeeded = 0, failures = emptyMap(), notice = null)
        deleteJob = scope.launch {
            var successCount = 0
            val failed = linkedMapOf<LibraryResourceKey, String>()
            for (key in snapshot) {
                if (token != generation) return@launch
                try {
                    delete(key)
                    if (token != generation) return@launch
                    successCount++
                    onDeleted(key)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (error: Exception) {
                    if (token != generation) return@launch
                    if (error.httpStatus() == 404) {
                        successCount++
                        onDeleted(key)
                    } else if (error.httpStatus() == 401) {
                        generation++
                        deleteJob = null
                        _state.value = LibrarySelectionState(notice = "登录状态已失效，请重新登录")
                        onUnauthorized()
                        return@launch
                    } else {
                        failed[key] = "删除请求未确认：${error.message ?: "未知错误"}。请先刷新后重试。"
                    }
                    _state.value = _state.value.copy(succeeded = successCount, failures = failed.toMap())
                }
                if (token != generation) return@launch
                // Keep progress observable while retaining all unattempted keys until completion.
                _state.value = _state.value.copy(succeeded = successCount, failures = failed.toMap())
            }
            if (token == generation) {
                val oldState = _state.value
                _state.value = oldState.copy(selection = (oldState.selection - snapshot.toSet()) + failed.keys, busy = false,
                    confirmation = null, succeeded = successCount, failures = failed.toMap(),
                    notice = "已从目录移除 $successCount 项（含服务器已不存在的项目）。" +
                        if (failed.isEmpty()) "" else "${failed.size} 项未确认，请先刷新核对。")
                deleteJob = null
            }
        }
    }

    /** Invalidates callbacks and state writes from any in-flight request. */
    fun clear() {
        generation++
        deleteJob?.cancel()
        deleteJob = null
        _state.value = LibrarySelectionState()
    }

    private fun Throwable.httpStatus(): Int? = when (this) {
        is ApiException -> statusCode
        else -> null
    }
}
