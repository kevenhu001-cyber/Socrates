package com.socrates.android.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ArtifactDiffTest {
    private fun success(old: String, new: String) =
        ArtifactDiff.compare(old, new) as ArtifactDiffResult.Success

    @Test fun identicalAndEmptyInputs() {
        assertEquals(emptyList<ArtifactDiffRow>(), success("", "").rows)
        assertEquals(
            listOf(ArtifactDiffRow(ArtifactDiffKind.EQUAL, "same\n", 1, 1)),
            success("same\n", "same\n").rows
        )
    }

    @Test fun replacementIsReportedAsRemoveThenAddWithBothLineNumbers() {
        val result = success("before\nold\nafter", "before\nnew\nafter")
        assertEquals(1, result.added)
        assertEquals(1, result.removed)
        assertEquals(
            listOf(
                ArtifactDiffRow(ArtifactDiffKind.EQUAL, "before\n", 1, 1),
                ArtifactDiffRow(ArtifactDiffKind.REMOVED, "old\n", 2, null),
                ArtifactDiffRow(ArtifactDiffKind.ADDED, "new\n", null, 2),
                ArtifactDiffRow(ArtifactDiffKind.EQUAL, "after", 3, 3)
            ),
            result.rows
        )
    }

    @Test fun pureInsertionAndDeletionHaveCorrectNumbersAndCounts() {
        val inserted = success("a\nb", "a\nx\nb")
        assertEquals(1, inserted.added)
        assertEquals(0, inserted.removed)
        assertEquals(ArtifactDiffRow(ArtifactDiffKind.ADDED, "x\n", null, 2), inserted.rows[1])

        val deleted = success("a\nx\nb", "a\nb")
        assertEquals(0, deleted.added)
        assertEquals(1, deleted.removed)
        assertEquals(ArtifactDiffRow(ArtifactDiffKind.REMOVED, "x\n", 2, null), deleted.rows[1])
    }

    @Test fun repeatedLinesRemainMatchedDeterministically() {
        val result = success("x\nx\ny\n", "x\ny\nx\n")
        assertEquals(2, result.rows.count { it.kind == ArtifactDiffKind.EQUAL })
        assertEquals(1, result.added)
        assertEquals(1, result.removed)
        assertEquals(listOf(1, 3), result.rows.filter { it.kind == ArtifactDiffKind.EQUAL }.map { it.oldLineNumber })
        assertEquals(listOf(1, 2), result.rows.filter { it.kind == ArtifactDiffKind.EQUAL }.map { it.newLineNumber })
    }

    @Test fun preservesUnicodeAndTreatsEveryLineEndingAndFinalNewlineAsContent() {
        val unicode = success("你好\n🙂", "你好\n🙂")
        assertEquals(listOf("你好\n", "🙂"), unicode.rows.map { it.text })

        val lineEndings = success("a\r\nb\rc\n", "a\nb\rc\n")
        assertEquals(1, lineEndings.added)
        assertEquals(1, lineEndings.removed)
        assertEquals("a\r\n", lineEndings.rows[0].text)
        assertEquals("a\n", lineEndings.rows[1].text)

        val finalNewline = success("tail", "tail\n")
        assertEquals(1, finalNewline.added)
        assertEquals(1, finalNewline.removed)
        assertEquals("tail", finalNewline.rows[0].text)
        assertEquals("tail\n", finalNewline.rows[1].text)
    }

    @Test fun rejectsInputsBeyondUtf16BudgetWithoutPartialRows() {
        val result = ArtifactDiff.compare("a".repeat(ArtifactDiff.MAX_UTF16_CODE_UNITS + 1), "")
        assertTrue(result is ArtifactDiffResult.Rejected)
        result as ArtifactDiffResult.Rejected
        assertEquals(ArtifactDiffRejection.UTF16_LIMIT, result.reason)
        assertEquals(ArtifactDiff.MAX_UTF16_CODE_UNITS + 1, result.oldUtf16CodeUnits)
        assertEquals(null, result.oldLineCount)
    }

    @Test fun rejectsTooManyLinesAndTooManyLcsCells() {
        val lineLimited = ArtifactDiff.compare("x\n".repeat(ArtifactDiff.MAX_LINES_PER_INPUT + 1), "")
            as ArtifactDiffResult.Rejected
        assertEquals(ArtifactDiffRejection.LINE_LIMIT, lineLimited.reason)
        assertEquals(ArtifactDiff.MAX_LINES_PER_INPUT + 1, lineLimited.oldLineCount)

        val cellLimited = ArtifactDiff.compare("x\n".repeat(1_000), "y\n".repeat(1_000))
            as ArtifactDiffResult.Rejected
        assertEquals(ArtifactDiffRejection.LCS_CELL_LIMIT, cellLimited.reason)
        assertEquals(1_000, cellLimited.oldLineCount)
        assertEquals(1_000, cellLimited.newLineCount)
    }

    @Test fun acceptsExactUtf16LimitOnEitherSide() {
        val source = "a".repeat(ArtifactDiff.MAX_UTF16_CODE_UNITS)
        assertEquals(source, success(source, "").rows.single().text)
        assertEquals(source, success("", source).rows.single().text)
        assertEquals(0, success(source, source).added)
    }

    @Test fun utf16LimitCountsSurrogatePairsNotCodePoints() {
        val source = "😀".repeat(ArtifactDiff.MAX_UTF16_CODE_UNITS / 2)
        assertEquals(source, success(source, source).rows.single().text)
        val rejected = ArtifactDiff.compare("", source + "x") as ArtifactDiffResult.Rejected
        assertEquals(ArtifactDiffRejection.UTF16_LIMIT, rejected.reason)
    }

    @Test fun exactLineLimitCanBeAddedOrRemovedInFull() {
        val source = "\n".repeat(ArtifactDiff.MAX_LINES_PER_INPUT)
        assertEquals(ArtifactDiff.MAX_LINES_PER_INPUT, success("", source).added)
        assertEquals(ArtifactDiff.MAX_LINES_PER_INPUT, success(source, "").removed)
        val rejected = ArtifactDiff.compare("", source + "\n") as ArtifactDiffResult.Rejected
        assertEquals(ArtifactDiffRejection.LINE_LIMIT, rejected.reason)
    }

    @Test fun exactMillionCellsIsAcceptedButNextCombinationRejects() {
        val source = "x\n".repeat(999)
        assertEquals(999, success(source, source).rows.size)
        val rejected = ArtifactDiff.compare(source + "x\n", source) as ArtifactDiffResult.Rejected
        assertEquals(ArtifactDiffRejection.LCS_CELL_LIMIT, rejected.reason)
    }

    @Test fun asymmetricCombinationWithinCellBudgetSucceeds() {
        val result = success("x\n".repeat(1000), "y\n".repeat(998))
        assertEquals(1000, result.removed)
        assertEquals(998, result.added)
    }

    @Test fun whitespaceCaseAndUnicodeNormalizationAreNotDiscarded() {
        val old = " A \n\té\n"
        val new = "a\n\te\u0301\n"
        val result = success(old, new)
        assertEquals(2, result.removed)
        assertEquals(2, result.added)
        assertEquals(old, result.rows.filter { it.kind != ArtifactDiffKind.ADDED }.joinToString("") { it.text })
        assertEquals(new, result.rows.filter { it.kind != ArtifactDiffKind.REMOVED }.joinToString("") { it.text })
    }

    @Test fun blankMixedEndingsAndMissingFinalNewlineRemainDistinct() {
        val source = "\r\n\r\n\n\rlast"
        val result = success(source, source)
        assertEquals(listOf("\r\n", "\r\n", "\n", "\r", "last"), result.rows.map { it.text })
        assertEquals(source, result.rows.joinToString("") { it.text })
    }

    @Test fun emptyToNonemptyAndBackReversesCounts() {
        val source = "one\r\ntwo\nthree"
        val forward = success("", source)
        val backward = success(source, "")
        assertEquals(forward.added, backward.removed)
        assertEquals(3, forward.added)
        assertEquals(0, forward.removed)
        assertEquals(0, backward.added)
    }

    @Test fun htmlJsonAndFencesRemainVerbatimText() {
        val source = "<script>x()</script>\n```json\n{\"id\":9007199254740993}\n```"
        val result = success("", source)
        assertEquals(source, result.rows.joinToString("") { it.text })
        assertTrue(result.rows.all { it.kind == ArtifactDiffKind.ADDED })
    }

    @Test fun generatedRepeatedLinesReconstructBothInputsWithSequentialNumbers() {
        val random = java.util.Random(73621)
        val tokens = listOf("a\n", "a\n", "😀\r\n", "\n", "中\r", " b \n")
        repeat(400) {
            fun input() = (0 until random.nextInt(18)).joinToString("") { tokens[random.nextInt(tokens.size)] } +
                if (random.nextBoolean()) "tail" else ""
            val old = input()
            val new = input()
            val diff = success(old, new)
            val oldRows = diff.rows.filter { it.kind != ArtifactDiffKind.ADDED }
            val newRows = diff.rows.filter { it.kind != ArtifactDiffKind.REMOVED }
            assertEquals(old, oldRows.joinToString("") { it.text })
            assertEquals(new, newRows.joinToString("") { it.text })
            assertEquals((1..oldRows.size).toList(), oldRows.map { it.oldLineNumber })
            assertEquals((1..newRows.size).toList(), newRows.map { it.newLineNumber })
            assertEquals(diff.added, diff.rows.count { it.kind == ArtifactDiffKind.ADDED })
            assertEquals(diff.removed, diff.rows.count { it.kind == ArtifactDiffKind.REMOVED })
            assertTrue(diff.rows.filter { it.kind == ArtifactDiffKind.ADDED }.all { it.oldLineNumber == null })
            assertTrue(diff.rows.filter { it.kind == ArtifactDiffKind.REMOVED }.all { it.newLineNumber == null })
        }
    }
}
