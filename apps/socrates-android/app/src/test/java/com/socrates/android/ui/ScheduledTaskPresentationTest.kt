package com.socrates.android.ui

import org.junit.Assert.*
import org.junit.Test

class ScheduledTaskPresentationTest {
    @Test fun onlyPendingAndActivePauseWhileOtherStatesResumeLikeWeb() {
        listOf("pending", "active").forEach { status ->
            assertTrue(ScheduledTaskPresentation.isActive(status))
            assertEquals("paused", ScheduledTaskPresentation.toggledStatus(status))
        }
        listOf("paused", "completed", "failed").forEach { status ->
            assertFalse(ScheduledTaskPresentation.isActive(status))
            assertEquals("active", ScheduledTaskPresentation.toggledStatus(status))
        }
    }
    @Test fun hourlyAndFailureUseProductLabelsInsteadOfRawWireValues() {
        assertEquals("每小时", ScheduledTaskPresentation.frequencyLabel("hourly"))
        assertEquals("执行失败", ScheduledTaskPresentation.statusLabel("failed"))
        assertEquals("已完成", ScheduledTaskPresentation.statusLabel("completed"))
    }
    @Test fun customDoesNotClaimCronRecurrenceAndUnknownWireValuesRemainVisible() {
        assertTrue(ScheduledTaskPresentation.frequencyLabel("custom").contains("不支持重复执行"))
        assertEquals("future-frequency", ScheduledTaskPresentation.frequencyLabel("future-frequency"))
        assertEquals("future-status", ScheduledTaskPresentation.statusLabel("future-status"))
    }
}
