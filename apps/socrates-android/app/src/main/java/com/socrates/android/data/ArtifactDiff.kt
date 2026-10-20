package com.socrates.android.data

/**
 * A bounded, read-only line diff. Line [ArtifactDiffRow.text] includes its exact
 * terminator (if any), so LF, CRLF, CR, and missing final newlines remain distinct.
 * All offsets/size limits are UTF-16 code units, matching Kotlin String.length.
 */
object ArtifactDiff {
    const val MAX_UTF16_CODE_UNITS: Int = 120_000
    const val MAX_LINES_PER_INPUT: Int = 1_000
    /** Maximum number of cells in the (oldLines + 1) x (newLines + 1) LCS table. */
    const val MAX_LCS_CELLS: Long = 1_000_000L

    fun compare(old: String, new: String): ArtifactDiffResult {
        if (old.length > MAX_UTF16_CODE_UNITS || new.length > MAX_UTF16_CODE_UNITS) {
            return ArtifactDiffResult.Rejected(
                ArtifactDiffRejection.UTF16_LIMIT,
                old.length,
                new.length,
                null,
                null
            )
        }
        val oldLines = splitLines(old)
        val newLines = splitLines(new)
        if (oldLines.size > MAX_LINES_PER_INPUT || newLines.size > MAX_LINES_PER_INPUT) {
            return ArtifactDiffResult.Rejected(
                ArtifactDiffRejection.LINE_LIMIT,
                old.length,
                new.length,
                oldLines.size,
                newLines.size
            )
        }
        val rowsCount = oldLines.size.toLong() + 1L
        val columnsCount = newLines.size.toLong() + 1L
        val cells = rowsCount * columnsCount
        if (cells > MAX_LCS_CELLS) {
            return ArtifactDiffResult.Rejected(
                ArtifactDiffRejection.LCS_CELL_LIMIT,
                old.length,
                new.length,
                oldLines.size,
                newLines.size
            )
        }

        // A single flattened IntArray bounds both memory and the O(oldLines * newLines)
        // computation. Limits above cap it at about 4 MiB and one million DP cells.
        val columns = columnsCount.toInt()
        val lcs = IntArray(cells.toInt())
        for (i in oldLines.size - 1 downTo 0) {
            val row = i * columns
            val nextRow = (i + 1) * columns
            for (j in newLines.size - 1 downTo 0) {
                lcs[row + j] = if (oldLines[i] == newLines[j]) {
                    1 + lcs[nextRow + j + 1]
                } else {
                    maxOf(lcs[nextRow + j], lcs[row + j + 1])
                }
            }
        }

        val rows = ArrayList<ArtifactDiffRow>(oldLines.size + newLines.size)
        var oldIndex = 0
        var newIndex = 0
        var added = 0
        var removed = 0
        while (oldIndex < oldLines.size && newIndex < newLines.size) {
            if (oldLines[oldIndex] == newLines[newIndex]) {
                rows += ArtifactDiffRow(
                    ArtifactDiffKind.EQUAL, oldLines[oldIndex], oldIndex + 1, newIndex + 1
                )
                oldIndex++
                newIndex++
            } else if (lcs[(oldIndex + 1) * columns + newIndex] >=
                lcs[oldIndex * columns + newIndex + 1]
            ) {
                rows += ArtifactDiffRow(ArtifactDiffKind.REMOVED, oldLines[oldIndex], oldIndex + 1, null)
                oldIndex++
                removed++
            } else {
                rows += ArtifactDiffRow(ArtifactDiffKind.ADDED, newLines[newIndex], null, newIndex + 1)
                newIndex++
                added++
            }
        }
        while (oldIndex < oldLines.size) {
            rows += ArtifactDiffRow(ArtifactDiffKind.REMOVED, oldLines[oldIndex], oldIndex + 1, null)
            oldIndex++
            removed++
        }
        while (newIndex < newLines.size) {
            rows += ArtifactDiffRow(ArtifactDiffKind.ADDED, newLines[newIndex], null, newIndex + 1)
            newIndex++
            added++
        }
        return ArtifactDiffResult.Success(rows, added, removed)
    }

    /** Empty input has no lines; a trailing terminator does not invent an extra line. */
    private fun splitLines(value: String): List<String> {
        if (value.isEmpty()) return emptyList()
        val lines = ArrayList<String>()
        var start = 0
        var index = 0
        while (index < value.length) {
            when (value[index]) {
                '\r' -> {
                    val end = if (index + 1 < value.length && value[index + 1] == '\n') index + 2 else index + 1
                    lines += value.substring(start, end)
                    start = end
                    index = end
                }
                '\n' -> {
                    val end = index + 1
                    lines += value.substring(start, end)
                    start = end
                    index = end
                }
                else -> index++
            }
        }
        if (start < value.length) lines += value.substring(start)
        return lines
    }
}

enum class ArtifactDiffKind { EQUAL, ADDED, REMOVED }

data class ArtifactDiffRow(
    val kind: ArtifactDiffKind,
    /** Exact source line, including LF/CRLF/CR terminator when present. */
    val text: String,
    val oldLineNumber: Int?,
    val newLineNumber: Int?
)

sealed interface ArtifactDiffResult {
    data class Success(
        val rows: List<ArtifactDiffRow>,
        val added: Int,
        val removed: Int
    ) : ArtifactDiffResult

    data class Rejected(
        val reason: ArtifactDiffRejection,
        val oldUtf16CodeUnits: Int,
        val newUtf16CodeUnits: Int,
        val oldLineCount: Int?,
        val newLineCount: Int?
    ) : ArtifactDiffResult
}

enum class ArtifactDiffRejection { UTF16_LIMIT, LINE_LIMIT, LCS_CELL_LIMIT }
