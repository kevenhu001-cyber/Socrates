package com.socrates.android.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.socrates.android.data.LearningModels
import com.socrates.android.data.LearningViewModel
import com.socrates.android.data.ApiClient

/** Entry point for native tutor or exam setup; parent supplies the selected learning mode. */
@Composable
fun LearningSetupScreen(kind: String, onCreated: (String) -> Unit, onClose: () -> Unit, onAuthLost: () -> Unit = {}) {
    val context=LocalContext.current
    val baseUrl=remember { ApiClient(context).baseUrl }
    val vm: LearningViewModel = viewModel(key="learning:$baseUrl"); val state by vm.state.collectAsStateWithLifecycle()
    var topic by remember(kind) { mutableStateOf("") }; var count by remember(kind) { mutableIntStateOf(5) }
    var difficulty by remember(kind) { mutableStateOf("intermediate") }; var instructions by remember(kind) { mutableStateOf("") }
    var selected by remember(kind) { mutableStateOf(setOf("multiple-choice", "fill-blank")) }
    LaunchedEffect(kind) { vm.reset() }
    DisposableEffect(kind) { onDispose { vm.cancelGeneration(); vm.reset() } }
    LaunchedEffect(state.session?.id, state.busy) { if(!state.busy) state.session?.id?.let(onCreated) }
    LaunchedEffect(state.error) { if (state.error?.contains("登录已过期") == true) onAuthLost() }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement=Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement=Arrangement.SpaceBetween) { Text(if(kind=="exam") "创建测验" else "创建导师课程", style=MaterialTheme.typography.headlineSmall); SocratesTextButton(onClick=onClose){Text("关闭")} }
        if(state.busy) { SocratesProgress(progress={if(state.total==0)0f else state.progress.toFloat()/state.total}, modifier=Modifier.fillMaxWidth()); Text("生成中 ${state.progress}/${state.total}"); SocratesTextButton(onClick=vm::cancelGeneration){Text("取消")} }
        else {
            SocratesField(topic,{topic=it},label={Text("主题")},modifier=Modifier.fillMaxWidth())
            Text("题目数量"); Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){(if(kind=="exam")listOf(3,5,10) else listOf(3,5)).forEach{ SocratesFilterChip(count==it,{count=it},label={Text("$it")}) }}
            if(kind=="exam") {
                Text("难度"); Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){listOf("beginner","intermediate","hard","expert").forEach{SocratesFilterChip(difficulty==it,{difficulty=it},label={Text(it)})}}
                Text("题型（至少选择一种）")
                LearningModels.types.forEach { type -> SocratesFilterChip(type in selected,{selected=if(type in selected){if(selected.size>1)selected-type else selected}else selected+type},label={Text(type)}) }
                SocratesField(instructions,{instructions=it},label={Text("额外要求")},modifier=Modifier.fillMaxWidth(),minLines=2)
            }
            state.error?.let { Text(it,color=MaterialTheme.colorScheme.error) }
            SocratesButton(onClick={ if(kind=="exam")vm.createExam(topic.trim(),count,difficulty,selected.toList(),instructions.trim()) else vm.createTutor(topic.trim(),count) },enabled=topic.isNotBlank()&&(kind!="exam"||selected.isNotEmpty())){Text(if(kind=="exam")"生成测验" else "生成诊断并开始")}
        }
    }
}

/** Exam answer/submit view and tutor diagnostic; parent opens this for sessions kind=exam or tutor. */
@Composable
fun LearningSessionScreen(sessionId: String, onTutorChat: (String) -> Unit = {}, onClose: () -> Unit = {}, onAuthLost: () -> Unit = {}) {
    val context=LocalContext.current
    val baseUrl=remember { ApiClient(context).baseUrl }
    val vm: LearningViewModel = viewModel(key="learning:$baseUrl"); val state by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(sessionId) { vm.openById(sessionId) }
    DisposableEffect(sessionId) { onDispose { vm.flushAnswers() } }
    LaunchedEffect(state.error) { if(state.error?.contains("登录已过期")==true)onAuthLost() }
    val session=state.session
    if(session==null || session.id!=sessionId) { Column(Modifier.padding(24.dp)){if(state.busy)SocratesSpinner() else Text(state.error?:"无法打开学习会话。",style=MaterialTheme.typography.bodyLarge);SocratesTextButton(onClick=onClose){Text("返回")}}; return }
    val exam=session.kind=="exam"; val payload=session.wire?.optJSONObject(if(exam)"examData" else "tutorData")
    val questions=if(exam)LearningModels.examQuestions(payload?:org.json.JSONObject()) else emptyList()
    val diag=payload?.optJSONArray("questions")
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){Text(session.title.ifBlank{session.topic},style=MaterialTheme.typography.headlineSmall);SocratesTextButton(onClick=onClose){Text("返回")}}
        state.error?.let { Text(it, color=MaterialTheme.colorScheme.error); SocratesTextButton(onClick=vm::retrySave) { Text("重试保存") } }
        if (!exam && diag == null) {
            Text("此会话没有本机诊断草稿；服务端仅存知识节点和教学计划，不存储诊断题。")
            SocratesTextButton(onClick={onTutorChat(session.id)}) { Text("继续已有导师会话") }
        }
        if(exam) {
            Text("已答 ${LearningModels.answeredCount(questions,state.answers)} / ${questions.size}")
            questions.forEach { q -> SocratesCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                Text("${q.index+1}.",style=MaterialTheme.typography.titleMedium); NativeMarkdown(q.prompt)
                if(q.type=="multiple-choice") q.options.forEachIndexed { idx,opt -> Row(Modifier.fillMaxWidth().clickable(enabled=state.grade==null){vm.select(q.index,idx)}.padding(8.dp)){SocratesRadio(selected=state.answers.optString(q.index.toString())==idx.toString(),onClick={vm.select(q.index,idx)},enabled=state.grade==null);Text("${opt.first}. ${opt.second}",Modifier.padding(top=12.dp))} }
                else SocratesField(state.answers.optString(q.index.toString()),{vm.answer(q.index,it)},label={Text("你的答案")},enabled=state.grade==null,modifier=Modifier.fillMaxWidth())
                state.grade?.let { grade -> Text(if(grade.results[q.index]==true)"正确" else "需复习；参考答案：${if(q.type=="multiple-choice")q.answer else q.accepted.joinToString(" / ").ifBlank{q.answer}}",color=if(grade.results[q.index]==true)MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error); if(q.explanation.isNotBlank())NativeMarkdown(q.explanation) }
            } } }
            state.grade?.let{Text("得分 ${it.correct}/${it.total}（${it.percent}%）",style=MaterialTheme.typography.titleLarge)}
            if(state.grade==null) SocratesButton(onClick=vm::submitExam,enabled=LearningModels.answeredCount(questions,state.answers)==questions.size){Text("提交并评分")}
        } else if(diag!=null) {
            val submitted=payload.optBoolean("submitted")
            if(!submitted) { Text("诊断 ${state.answers.length()} / ${diag.length()}"); (0 until diag.length()).forEach { i -> val q=diag.optJSONObject(i)?:return@forEach; NativeMarkdown("${i+1}. ${q.optString("q")}"); val opts=q.optJSONArray("opts")?:q.optJSONArray("options")?:org.json.JSONArray(); (0 until opts.length()).forEach { n -> val item=opts.optJSONObject(n); val value=item?.optString("text")?:opts.optString(n); val level=item?.optString("level").orEmpty(); Row(Modifier.fillMaxWidth().clickable{vm.select(i,n)}){SocratesRadio(state.answers.optString(i.toString())==n.toString(),{vm.select(i,n)});Text(if(level.isBlank())value else "$value · $level",Modifier.padding(top=12.dp))} } }; SocratesButton(onClick=vm::submitDiagnostic,enabled=state.answers.length()>=diag.length()){Text("提交诊断，生成学习进度")}}
            else { Text("诊断已完成。知识节点与计划同步到会话；诊断题与选项保存在本机加密草稿，不跨设备同步。",style=MaterialTheme.typography.titleMedium); SocratesTextButton(onClick={onTutorChat(session.id)}){Text("继续导师教学对话")}; val nodes=session.wire?.optJSONArray("kbNodes"); if(nodes!=null)(0 until nodes.length()).forEach{nodes.optJSONObject(it)?.let{node->Text("${node.optString("name")}: ${node.optString("status")}")}} }
        }
    }
}
