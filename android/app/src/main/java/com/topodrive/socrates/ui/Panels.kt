package com.topodrive.socrates.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.topodrive.socrates.R
import com.topodrive.socrates.data.Api
import com.topodrive.socrates.icons.SocIcons
import com.topodrive.socrates.theme.JetBrainsMonoFamily
import com.topodrive.socrates.theme.LocalSocratesColors
import com.topodrive.socrates.vm.AppState

/** Panel header shared by every list screen. */
@Composable
private fun PanelHeader(title: String, onBack: () -> Unit, actions: (@Composable () -> Unit)? = null) {
    val c = LocalSocratesColors.current
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconBtn(SocIcons.ArrowLeft, "back", onBack, size = 36.dp, iconSize = 18.dp)
        Spacer(Modifier.width(4.dp))
        Text(title, color = c.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        actions?.invoke()
    }
}

/* ── Projects ── */

@Composable
fun ProjectsPanel(app: AppState) {
    val c = LocalSocratesColors.current
    val projects by app.projects.collectAsState()
    var createOpen by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize()) {
        PanelHeader(stringResource(R.string.nav_projects), { app.openScreen(AppState.Screen.HOME) }) {
            IconBtn(SocIcons.Plus, "new", { createOpen = true })
        }
        if (projects.isEmpty()) {
            EmptyState(SocIcons.Projects, stringResource(R.string.projects_empty))
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
                items(projects, key = { it.id }) { p ->
                    SocCard(onClick = { app.newChat(projectId = p.id) }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(34.dp).clip(CircleShape).background(c.surfacePressed), contentAlignment = Alignment.Center) {
                                Icon(SocIcons.Folder, null, tint = c.textMuted, modifier = Modifier.size(16.dp))
                            }
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(p.name, color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                                if (!p.description.isNullOrBlank()) Text(p.description, color = c.textMuted, fontSize = 12.sp, maxLines = 1)
                            }
                            IconBtn(SocIcons.Trash, "delete", { app.deleteProject(p.id) }, size = 30.dp, iconSize = 15.dp)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
    }

    if (createOpen) {
        var name by remember { mutableStateOf("") }
        var desc by remember { mutableStateOf("") }
        var prompt by remember { mutableStateOf("") }
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { createOpen = false },
            containerColor = c.surface,
            title = { Text(stringResource(R.string.projects_new), color = c.text) },
            text = {
                Column {
                    SocField(name, { name = it }, stringResource(R.string.projects_name))
                    Spacer(Modifier.height(8.dp))
                    SocField(desc, { desc = it }, stringResource(R.string.projects_desc))
                    Spacer(Modifier.height(8.dp))
                    SocField(prompt, { prompt = it }, stringResource(R.string.projects_prompt), singleLine = false)
                }
            },
            confirmButton = {
                SocButton(stringResource(R.string.action_create), {
                    if (name.isNotBlank()) {
                        app.createProject(name, desc.ifBlank { null }, null, null, prompt.ifBlank { null })
                        createOpen = false
                    }
                }, small = true)
            },
            dismissButton = { SocButton(stringResource(R.string.action_cancel), { createOpen = false }, primary = false, small = true) },
        )
    }
}

/* ── Library (files) ── */

@Composable
fun LibraryPanel(app: AppState) {
    val c = LocalSocratesColors.current
    val files by app.files.collectAsState()
    val ctx = LocalContext.current
    Column(Modifier.fillMaxSize()) {
        PanelHeader(stringResource(R.string.nav_library), { app.openScreen(AppState.Screen.HOME) })
        if (files.isEmpty()) EmptyState(SocIcons.Book, stringResource(R.string.library_empty))
        else LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
            items(files, key = { it.id }) { f ->
                ListRow(
                    title = f.name,
                    subtitle = "${humanSize(f.size)} · ${f.mimeType}",
                    icon = if (f.mimeType.startsWith("image/")) SocIcons.Image else SocIcons.FileText,
                    trailing = {
                        IconBtn(SocIcons.ExternalLink, "open", {
                            ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Api.fileRawUrl(f.id))))
                        }, size = 30.dp, iconSize = 15.dp)
                    },
                )
            }
        }
    }
}

private fun humanSize(size: Long): String = when {
    size >= 1_048_576 -> "%.1f MB".format(size / 1_048_576.0)
    size >= 1024 -> "%.0f KB".format(size / 1024.0)
    else -> "$size B"
}

/* ── Artifacts ── */

@Composable
fun ArtifactsPanel(app: AppState) {
    val c = LocalSocratesColors.current
    val artifacts by app.artifacts.collectAsState()
    val ctx = LocalContext.current
    Column(Modifier.fillMaxSize()) {
        PanelHeader(stringResource(R.string.nav_artifacts), { app.openScreen(AppState.Screen.HOME) })
        if (artifacts.isEmpty()) EmptyState(SocIcons.Sparkles, stringResource(R.string.artifacts_empty))
        else LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
            items(artifacts, key = { it.id }) { a ->
                SocCard(onClick = {
                    ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${Api.webBaseUrl}/artifacts/${a.id}")))
                }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(SocIcons.Sparkles, null, tint = c.textMuted, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(a.title ?: a.name ?: a.type ?: "artifact", color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            if (a.type != null) Text(a.type, color = c.textMuted, fontSize = 12.sp)
                        }
                        Icon(SocIcons.ExternalLink, null, tint = c.textFaint, modifier = Modifier.size(14.dp))
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

/* ── Scheduled tasks ── */

@Composable
fun ScheduledPanel(app: AppState) {
    val c = LocalSocratesColors.current
    val tasks by app.tasks.collectAsState()
    var createOpen by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        PanelHeader(stringResource(R.string.nav_scheduled), { app.openScreen(AppState.Screen.HOME) }) {
            IconBtn(SocIcons.Plus, "new", { createOpen = true })
        }
        if (tasks.isEmpty()) EmptyState(SocIcons.Calendar, stringResource(R.string.scheduled_empty))
        else LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
            items(tasks, key = { it.id }) { t ->
                SocCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(SocIcons.Clock, null, tint = c.textMuted, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(t.title, color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            Text(
                                "${t.frequency}${t.nextRunAt?.let { " · next $it" } ?: ""}",
                                color = c.textMuted, fontSize = 12.sp,
                            )
                        }
                        IconBtn(SocIcons.Play, stringResource(R.string.scheduled_run), { app.runTask(t.id) }, size = 30.dp, iconSize = 14.dp)
                        IconBtn(SocIcons.Trash, "delete", { app.deleteTask(t.id) }, size = 30.dp, iconSize = 14.dp)
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
    if (createOpen) {
        var title by remember { mutableStateOf("") }
        var prompt by remember { mutableStateOf("") }
        var freq by remember { mutableStateOf("daily") }
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { createOpen = false },
            containerColor = c.surface,
            title = { Text(stringResource(R.string.scheduled_new), color = c.text) },
            text = {
                Column {
                    SocField(title, { title = it }, stringResource(R.string.scheduled_title))
                    Spacer(Modifier.height(8.dp))
                    SocField(prompt, { prompt = it }, stringResource(R.string.scheduled_prompt), singleLine = false)
                    Spacer(Modifier.height(10.dp))
                    Segmented(
                        listOf(
                            "once" to stringResource(R.string.scheduled_freq_once),
                            "daily" to stringResource(R.string.scheduled_freq_daily),
                            "weekly" to stringResource(R.string.scheduled_freq_weekly),
                        ),
                        freq, { freq = it },
                    )
                }
            },
            confirmButton = {
                SocButton(stringResource(R.string.action_create), {
                    if (title.isNotBlank() && prompt.isNotBlank()) {
                        app.createTask(title, prompt, freq, null)
                        createOpen = false
                    }
                }, small = true)
            },
            dismissButton = { SocButton(stringResource(R.string.action_cancel), { createOpen = false }, primary = false, small = true) },
        )
    }
}

/* ── Plugins (static catalog, mirrors web "available capabilities" list) ── */

@Composable
fun PluginsPanel(app: AppState) {
    val c = LocalSocratesColors.current
    Column(Modifier.fillMaxSize()) {
        PanelHeader(stringResource(R.string.nav_plugins), { app.openScreen(AppState.Screen.HOME) })
        Text(
            stringResource(R.string.plugins_subtitle),
            color = c.textMuted, fontSize = 13.sp,
            modifier = Modifier.padding(horizontal = 18.dp),
        )
        Spacer(Modifier.height(8.dp))
        val plugins = listOf(
            Triple(SocIcons.Globe, "Web search", "Search the web for sources and current events"),
            Triple(SocIcons.Book, "Library QA", "Answer questions grounded in your uploaded files"),
            Triple(SocIcons.ToolRun, "Code execution", "Run Python in a sandbox with charts and artifacts"),
            Triple(SocIcons.Sparkles, "Artifacts", "Generate interactive pages and visualisations"),
            Triple(SocIcons.Bookmark, "Memory", "Remember facts across conversations"),
            Triple(SocIcons.Exam, "Exam mode", "Generate practice questions and grade answers"),
        )
        LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
            items(plugins) { (icon, name, desc) ->
                ListRow(title = name, subtitle = desc, icon = icon, trailing = {
                    Box(
                        Modifier.clip(RoundedCornerShape(999.dp)).background(c.successSoft).padding(horizontal = 8.dp, vertical = 3.dp),
                    ) { Text("ON", color = c.success, fontSize = 10.sp, fontWeight = FontWeight.SemiBold) }
                })
            }
        }
    }
}

/* ── Exam ── */

@Composable
fun ExamPanel(app: AppState) {
    val c = LocalSocratesColors.current
    var topic by remember { mutableStateOf("") }
    var count by remember { mutableStateOf("10") }
    var difficulty by remember { mutableStateOf("medium") }
    var generating by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        PanelHeader(stringResource(R.string.nav_exam), { app.openScreen(AppState.Screen.HOME) })
        Column(Modifier.fillMaxSize().padding(horizontal = 18.dp).verticalScroll(rememberScrollState())) {
            Text(
                stringResource(R.string.exam_empty),
                color = c.textMuted, fontSize = 13.sp,
            )
            Spacer(Modifier.height(16.dp))
            SocField(topic, { topic = it }, stringResource(R.string.exam_topic))
            Spacer(Modifier.height(10.dp))
            SocField(count, { count = it.filter(Char::isDigit).take(2) }, stringResource(R.string.exam_count))
            Spacer(Modifier.height(10.dp))
            Text(stringResource(R.string.exam_difficulty), color = c.textMuted, fontSize = 12.sp)
            Spacer(Modifier.height(6.dp))
            Segmented(
                listOf(
                    "easy" to stringResource(R.string.exam_easy),
                    "medium" to stringResource(R.string.exam_medium),
                    "hard" to stringResource(R.string.exam_hard),
                ),
                difficulty, { difficulty = it },
            )
            Spacer(Modifier.height(18.dp))
            SocButton(stringResource(R.string.exam_generate), {
                if (topic.isBlank() || generating) return@SocButton
                generating = true
                // Exam sessions are chat sessions with kind="exam" — the model
                // generates questions inline; grading flows through the same
                // stream. Matches web behaviour where exam is a chat variant.
                app.sendMessage("Generate a ${difficulty} practice exam on \"$topic\" with ${count.toIntOrNull() ?: 10} questions (mixed choice and short answer). Present questions first; wait for my answers, then grade them.")
                generating = false
            }, Modifier.fillMaxWidth(), loading = generating)
        }
    }
}

/* ── Knowledge boundary ── */

@Composable
fun KnowledgePanel(app: AppState) {
    val c = LocalSocratesColors.current
    val kb by app.knowledge.collectAsState()
    Column(Modifier.fillMaxSize()) {
        PanelHeader(stringResource(R.string.nav_knowledge), { app.openScreen(AppState.Screen.MORE) })
        val nodes = kb?.get("nodes")?.let {
            try {
                kotlinx.serialization.json.JsonArray::class.java.cast(it)
            } catch (_: Exception) { null }
        }
        if (nodes == null || (nodes as kotlinx.serialization.json.JsonArray).isEmpty()) {
            EmptyState(SocIcons.Knowledge, stringResource(R.string.knowledge_empty))
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
                items((nodes as kotlinx.serialization.json.JsonArray).size) { i ->
                    val n = (nodes as kotlinx.serialization.json.JsonArray)[i].jsonObjectOrNull() ?: return@items
                    ListRow(
                        title = n["nodeName"]?.toString()?.trim('"') ?: "node",
                        subtitle = "${n["status"]?.toString()?.trim('"') ?: ""} · ${n["sessionTitle"]?.toString()?.trim('"') ?: ""}",
                        icon = SocIcons.Knowledge,
                    )
                }
            }
        }
    }
}

private fun kotlinx.serialization.json.JsonElement.jsonObjectOrNull() =
    this as? kotlinx.serialization.json.JsonObject

/* ── Mistakes ── */

@Composable
fun MistakesPanel(app: AppState) {
    val c = LocalSocratesColors.current
    val mistakes by app.mistakes.collectAsState()
    var showResolved by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        PanelHeader(stringResource(R.string.nav_mistakes), { app.openScreen(AppState.Screen.MORE) }) {
            Row(
                Modifier.clip(RoundedCornerShape(999.dp)).background(c.surfaceRaised)
                    .clickable { showResolved = !showResolved }
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            ) {
                Text(
                    stringResource(if (showResolved) R.string.mistakes_resolved else R.string.mistakes_unresolved),
                    color = c.textMuted, fontSize = 12.sp,
                )
            }
        }
        val shown = mistakes.filter { it.isResolved == showResolved }
        if (shown.isEmpty()) EmptyState(SocIcons.AlertCircle, stringResource(R.string.mistakes_empty))
        else LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
            items(shown, key = { it.id }) { m ->
                SocCard {
                    Text(m.questionContent.take(200), color = c.text, fontSize = 14.sp)
                    if (!m.userAnswer.isNullOrBlank()) {
                        Spacer(Modifier.height(6.dp))
                        Text("Your answer: ${m.userAnswer}", color = c.danger, fontSize = 12.5.sp)
                    }
                    if (!m.correctAnswer.isNullOrBlank()) {
                        Spacer(Modifier.height(4.dp))
                        Text("Correct: ${m.correctAnswer}", color = c.success, fontSize = 12.5.sp)
                    }
                    Spacer(Modifier.height(8.dp))
                    Row {
                        SocButton(
                            stringResource(if (m.isResolved) R.string.mistakes_unresolved else R.string.mistakes_resolved),
                            { app.toggleMistake(m, !m.isResolved) }, primary = false, small = true,
                        )
                        Spacer(Modifier.weight(1f))
                        IconBtn(SocIcons.Trash, "delete", { app.deleteMistake(m.id) }, size = 30.dp, iconSize = 14.dp)
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

/* ── More ── */

@Composable
fun MorePanel(app: AppState) {
    val c = LocalSocratesColors.current
    Column(Modifier.fillMaxSize()) {
        PanelHeader(stringResource(R.string.nav_more), { app.openScreen(AppState.Screen.HOME) })
        Column(Modifier.fillMaxSize().padding(horizontal = 12.dp).verticalScroll(rememberScrollState())) {
            ListRow(stringResource(R.string.nav_knowledge), icon = SocIcons.Knowledge) { app.openScreen(AppState.Screen.KNOWLEDGE) }
            ListRow(stringResource(R.string.nav_mistakes), icon = SocIcons.AlertCircle) { app.openScreen(AppState.Screen.MISTAKES) }
            ListRow(stringResource(R.string.settings_memory), icon = SocIcons.Bookmark) { app.openSettings(true) }
            ListRow(stringResource(R.string.settings_title), icon = SocIcons.Sliders) { app.openSettings(true) }
            ListRow(stringResource(R.string.settings_api_keys), icon = SocIcons.KeyRound) { app.openApiKeys(true) }
            Divider(Modifier.padding(vertical = 8.dp))
            ListRow(stringResource(R.string.settings_logout), icon = SocIcons.LogOut, titleColor = c.danger) { app.logout() }
        }
    }
}

/* ── Skills & shortcuts ── */

@Composable
fun SkillsPanel(app: AppState) {
    val c = LocalSocratesColors.current
    Column(Modifier.fillMaxSize()) {
        PanelHeader(stringResource(R.string.nav_skills), { app.openScreen(AppState.Screen.HOME) })
        Column(Modifier.padding(horizontal = 18.dp).verticalScroll(rememberScrollState())) {
            Text("Starter prompts", color = c.textMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            val starters = listOf(
                "Explain this concept like I'm five" to "Explain ",
                "Quiz me on a topic" to "Quiz me on ",
                "Summarise my notes" to "Summarise ",
                "Plan my study session" to "Help me plan a study session on ",
                "Write a practice exam" to "Generate a practice exam on ",
                "Review my mistake" to "Help me review a mistake: ",
            )
            for ((label, prefill) in starters) {
                ListRow(title = label, icon = SocIcons.Zap) { app.prefillComposer(prefill); app.newChat() }
            }
        }
    }
}
