package com.socrates.android.data

/** Routes inline <think> blocks away from the visible answer, including tags split across SSE frames. */
internal class InlineThinkScanner(
    private val onVisibleText: (String) -> Unit,
    private val onThinking: (String) -> Unit,
) {
    private var thinking = false
    private var tail = ""
    private var thought = ""
    private var finished = false

    val isThinking: Boolean get() = thinking

    fun push(delta: String) {
        if (finished || delta.isEmpty()) return
        var pending = delta
        while (true) {
            val probe = tail + pending
            if (!thinking) {
                val open = probe.indexOf(OPEN, ignoreCase = true)
                if (open < 0) {
                    val visibleLength = probe.length - pendingOpenLength(probe)
                    if (visibleLength > 0) onVisibleText(probe.substring(0, visibleLength))
                    tail = probe.substring(visibleLength)
                    return
                }
                if (open > 0) onVisibleText(probe.substring(0, open))
                tail = ""
                thinking = true
                thought = ""
                pending = probe.substring(open + OPEN.length)
            } else {
                val close = probe.indexOf(CLOSE, ignoreCase = true)
                if (close < 0) {
                    val safeLength = (probe.length - CLOSE.length + 1).coerceAtLeast(0)
                    thought += probe.substring(0, safeLength)
                    tail = probe.substring(safeLength)
                    emitThought()
                    return
                }
                thought += probe.substring(0, close)
                emitThought()
                thinking = false
                tail = ""
                pending = probe.substring(close + CLOSE.length)
            }
            if (pending.isEmpty()) return
        }
    }

    /** Flush the final plain-text tail or persist an unterminated thought at end of stream. */
    fun finish() {
        if (finished) return
        finished = true
        if (thinking) {
            thought += tail
            tail = ""
            emitThought()
            thinking = false
        } else if (tail.isNotEmpty()) {
            onVisibleText(tail)
            tail = ""
        }
    }

    private fun emitThought() {
        if (thought.isNotEmpty()) onThinking(thought)
        thought = ""
    }

    private fun pendingOpenLength(text: String): Int {
        for (length in minOf(text.length, OPEN.length - 1) downTo 1) {
            if (text.endsWith(OPEN.substring(0, length), ignoreCase = true)) return length
        }
        return 0
    }

    companion object {
        private const val OPEN = "<think>"
        private const val CLOSE = "</think>"

        fun split(raw: String): Pair<String, String> {
            val visible = StringBuilder()
            val reasoning = StringBuilder()
            InlineThinkScanner(visible::append, reasoning::append).apply { push(raw); finish() }
            return visible.toString() to reasoning.toString()
        }

        /** Convert a raw stream offset to the matching visible answer offset. */
        fun visibleOffset(raw: String, rawOffset: Int): Int {
            val offset = rawOffset.coerceIn(0, raw.length)
            // A tool event can arrive after only part of an opening tag was
            // streamed. If the full response later completes that tag, keep
            // the event before the hidden block rather than counting `<thi`.
            val possibleStart = (offset - OPEN.length + 1).coerceAtLeast(0)
            for (start in possibleStart until offset) {
                if (start + OPEN.length > offset && raw.regionMatches(start, OPEN, 0, OPEN.length, ignoreCase = true)) {
                    return split(raw.substring(0, start)).first.length
                }
            }
            val prefix = raw.substring(0, offset)
            return split(prefix).first.length
        }
    }
}
