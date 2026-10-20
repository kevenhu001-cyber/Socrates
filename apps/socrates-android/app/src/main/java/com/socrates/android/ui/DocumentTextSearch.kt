package com.socrates.android.ui

/** Bounded literal search helpers for extracted document text. */
object DocumentTextSearch {
    const val MAX_QUERY_LENGTH = 200
    const val MAX_MATCHES = 1000

    /** Finds literal, case-insensitive, non-overlapping matches without splitting surrogate pairs. */
    fun find(text: String, query: String, maxMatches: Int = MAX_MATCHES): DocumentSearchResult {
        require(query.length <= MAX_QUERY_LENGTH) { "Query must be at most $MAX_QUERY_LENGTH UTF-16 code units" }
        require(maxMatches in 1..MAX_MATCHES) { "maxMatches must be in 1..$MAX_MATCHES" }
        if (query.isEmpty()) return DocumentSearchResult(emptyList(), false)

        val matches = ArrayList<DocumentTextMatch>(minOf(maxMatches, 32))
        var from = 0
        while (from <= text.length - query.length) {
            val found = text.indexOf(query, from, ignoreCase = true)
            if (found < 0) break
            val end = found + query.length
            if (!splitsSurrogatePair(text, found) && !splitsSurrogatePair(text, end)) {
                if (matches.size == maxMatches) return DocumentSearchResult(matches, true)
                matches.add(DocumentTextMatch(found, end))
                from = end
            } else {
                from = found + 1
            }
        }
        return DocumentSearchResult(matches, false)
    }

    /** Finds the page-like segment containing a UTF-16 offset; exact boundaries belong to the next segment. */
    fun segmentIndex(pages: List<String>, offset: Int): Int {
        if (pages.isEmpty()) {
            require(offset == 0) { "offset must be 0 when pages is empty" }
            return 0
        }
        val totalLength = pages.sumOf { it.length }
        require(offset in 0 until totalLength) { "offset must identify a character in the concatenated pages" }
        var start = 0
        for ((index, page) in pages.withIndex()) {
            val end = start + page.length
            if (offset < end) return index
            start = end
        }
        error("Unreachable")
    }

    /** Intersects a match with one segment, returning segment-local inclusive bounds. */
    fun localRanges(match: DocumentTextMatch, segmentStart: Int, segmentLength: Int): IntRange? {
        require(match.start >= 0 && match.endExclusive >= match.start)
        require(segmentStart >= 0 && segmentLength >= 0)
        val start = maxOf(match.start, segmentStart)
        val endExclusive = minOf(match.endExclusive, segmentStart + segmentLength)
        return if (start < endExclusive) (start - segmentStart)..(endExclusive - segmentStart - 1) else null
    }

    private fun splitsSurrogatePair(value: String, offset: Int): Boolean =
        offset > 0 && offset < value.length && value[offset - 1].isHighSurrogate() && value[offset].isLowSurrogate()
}

data class DocumentTextMatch(val start: Int, val endExclusive: Int)

data class DocumentSearchResult(val matches: List<DocumentTextMatch>, val hasMore: Boolean)
