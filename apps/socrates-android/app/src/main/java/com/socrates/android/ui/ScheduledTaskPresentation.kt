package com.socrates.android.ui

/** Mirrors frontend ScheduledTaskRow: only pending/active are enabled; other states can resume. */
internal object ScheduledTaskPresentation {
    fun isActive(status: String): Boolean = status == "pending" || status == "active"
    fun toggledStatus(status: String): String = if (isActive(status)) "paused" else "active"
    fun statusLabel(status: String): String = when (status) {
        "pending", "active" -> "已开启"
        "paused" -> "已暂停"
        "completed" -> "已完成"
        "failed" -> "执行失败"
        else -> status
    }
    fun frequencyLabel(frequency: String): String = when (frequency) {
        "once" -> "一次"
        "hourly" -> "每小时"
        "daily" -> "每天"
        "weekly" -> "每周"
        "monthly" -> "每月"
        // The route accepts custom, but scheduler.computeNextRunAt does not implement cron recurrence.
        "custom" -> "自定义（当前调度器不支持重复执行）"
        else -> frequency
    }
}
