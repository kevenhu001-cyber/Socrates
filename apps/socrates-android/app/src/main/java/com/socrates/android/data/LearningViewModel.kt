package com.socrates.android.data

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class LearningState(val busy:Boolean=false, val error:String?=null, val progress:Int=0, val total:Int=0, val session:ChatSession?=null, val answers:JSONObject=JSONObject(), val grade:LearningGrade?=null)

/** Real generation and session-backed learning state for native tutor and exam flows. */
class LearningViewModel(application: Application) : AndroidViewModel(application) {
    private val _state=kotlinx.coroutines.flow.MutableStateFlow(LearningState()); val state=_state
    private val api=ApiClient(application){_state.value=_state.value.copy(error="登录已过期，请重新登录。")}
    private var generation:Job?=null
    private var loadJob:Job?=null
    private var answerSaveJob:Job?=null
    private val saveMutex=Mutex()
    private var epoch=0L
    private var owner: String = ""

    fun reset() { epoch++; api.cancelStream(); generation?.cancel(); loadJob?.cancel(); answerSaveJob?.cancel(); _state.value=LearningState() }
    fun createExam(topic:String,count:Int,difficulty:String,types:List<String>,instructions:String) {
        require(topic.isNotBlank() && count>0 && types.any{it in LearningModels.types})
        reset(); val requestEpoch=epoch; _state.value=LearningState(busy=true,total=count)
        generation=viewModelScope.launch {
            var draft:ChatSession?=null
            try {
                owner = withContext(Dispatchers.IO) { api.currentUser().getString("id") }
                val id=UUID.randomUUID().toString()
                draft=withContext(Dispatchers.IO){api.saveSession(ChatSession(id=id,title=topic,topic=topic,mode="chat",kind="exam",wire=JSONObject().put("examData",JSONObject().put("topic",topic).put("questions",JSONArray()).put("answers",JSONObject()).put("submitted",false))))}
                val selected=LearningModels.types.filter{it in types}.ifEmpty{LearningModels.types}; val questions=JSONArray(); val prior=mutableListOf<String>(); val lang=language(topic)
                for(i in 0 until count) {
                    if(requestEpoch!=epoch) return@launch
                    val type=selected[i%selected.size]
                    val text=streamRaw(draft.id,LearningModels.examPrompt(topic,count,difficulty,type,lang,instructions,i,prior),"Generate question ${i+1} now.")
                    val q=parseExam(text,type)?:error("无法解析第 ${i+1} 道题，请重试。")
                    questions.put(q); prior+=q.optString("q"); _state.value=_state.value.copy(progress=i+1)
                }
                val data=JSONObject().put("topic",topic).put("difficulty",difficulty).put("count",count).put("lang",lang).put("types",JSONArray(selected)).put("questions",questions).put("answers",JSONObject()).put("submitted",false).put("generatedAt",System.currentTimeMillis())
                val complete=draft.copy(title=topic,topic=topic,kind="exam",wire=JSONObject(draft.wire?.toString()?:"{}").put("examData",data))
                val saved=withContext(Dispatchers.IO){api.saveSession(complete)}
                if (saved.kind == "tutor") withContext(Dispatchers.IO) { api.saveLearningDraft(owner, saved.id, data) }
                if(requestEpoch==epoch)_state.value=LearningState(session=saved,total=count)
            } catch(e:Exception) { if(requestEpoch==epoch && e !is kotlinx.coroutines.CancellationException)_state.value=_state.value.copy(busy=false,error=e.message?:"生成测验失败") }
        }
    }
    fun createTutor(topic:String,count:Int,language:String="English") {
        require(topic.isNotBlank()&&count>0); reset(); val requestEpoch=epoch; _state.value=LearningState(busy=true,total=count)
        generation=viewModelScope.launch {
            try {
                owner = withContext(Dispatchers.IO) { api.currentUser().getString("id") }
                val id=UUID.randomUUID().toString()
                val initial=ChatSession(id=id,title=topic,topic=topic,mode="tutor",kind="tutor",phase="diagnostic",wire=JSONObject().put("tutorData",JSONObject().put("questions",JSONArray()).put("answers",JSONObject()).put("submitted",false)).put("kbNodes",JSONArray().put(JSONObject().put("name",topic).put("status","blank"))).put("teachingStage","diagnostic").put("currentNode",0).put("substantiveCount",0))
                val draft=withContext(Dispatchers.IO){api.saveSession(initial)}; val questions=JSONArray(); val prior=mutableListOf<String>()
                repeat(count) { i ->
                    if(requestEpoch!=epoch)return@launch
                    val text=streamRaw(draft.id,LearningModels.diagnosticPrompt(topic,i,count,language,prior),"Generate diagnostic question ${i+1}.")
                    val q=LearningModels.parseDiagnostic(text,i)?:error("无法解析诊断题 ${i+1}，请重试。"); questions.put(q); prior+=q.optString("q"); _state.value=_state.value.copy(progress=i+1)
                }
                val data=JSONObject().put("questions",questions).put("answers",JSONObject()).put("submitted",false)
                val wire=JSONObject(draft.wire?.toString()?:"{}").put("tutorData",data).put("teachingStage","diagnostic").put("currentNode",0).put("substantiveCount",0)
                val saved=withContext(Dispatchers.IO){api.saveSession(draft.copy(wire=wire))}
                if (saved.kind == "tutor") withContext(Dispatchers.IO) { api.saveLearningDraft(owner, saved.id, data) }
                if(requestEpoch==epoch)_state.value=LearningState(session=saved,total=count)
            } catch(e:Exception) { if(requestEpoch==epoch&&e !is kotlinx.coroutines.CancellationException)_state.value=_state.value.copy(busy=false,error=e.message?:"生成诊断失败") }
        }
    }
    private suspend fun streamRaw(sessionId:String,system:String,user:String):String=withContext(Dispatchers.IO) {
        val out=StringBuilder(); var failure:Throwable?=null
        api.streamChat(sessionId,listOf(ChatMessage(role="system",content=system),ChatMessage(role="user",content=user)),onDelta={out.append(it)},onDone={failure=it},context=JSONObject().put("mode","chat"))
        failure?.let{throw it}; out.toString()
    }
    private fun parseExam(text:String,type:String):JSONObject?=runCatching {
        val start=text.indexOf('{'); val end=text.lastIndexOf('}'); if(start<0||end<=start)return null
        val obj=JSONObject(text.substring(start,end+1)); val q=obj.optString("q").ifBlank{obj.optString("question")}; if(q.isBlank())return null
        JSONObject().put("q",q).put("type",type).put("opts",obj.optJSONArray("opts")?:JSONArray()).put("answer",obj.optString("answer")).put("answers",obj.optJSONArray("answers")?:JSONArray()).put("explanation",obj.optString("explanation"))
    }.getOrNull()
    private fun language(topic:String)=when {
        topic.any{it in '\u4e00'..'\u9fff'}->"Chinese"; topic.any{it in '\u3040'..'\u30ff'}->"Japanese"; topic.any{it in '\uac00'..'\ud7af'}->"Korean"; topic.any{it in '\u0400'..'\u04ff'}->"Russian"; topic.any{it in '\u0600'..'\u06ff'}->"Arabic"; topic.any{it in '\u0900'..'\u097f'}->"Hindi"; topic.any{it in '\u0370'..'\u03ff'}->"Greek"; topic.any{it in '\u0590'..'\u05ff'}->"Hebrew"; topic.any{it in '\u0e00'..'\u0e7f'}->"Thai"; else->"English"
    }
    fun answer(index:Int,value:String) { val s=_state.value; val next=JSONObject(s.answers.toString()).put(index.toString(),value); _state.value=s.copy(answers=next); scheduleSave(s.session,next) }
    fun select(index:Int,option:Int)=answer(index,option.toString())
    fun submitExam() {
        val s=_state.value; val session=s.session?:return; val data=session.wire?.optJSONObject("examData")?:return
        val grade=LearningModels.grade(LearningModels.examQuestions(data),s.answers)
        val results=JSONObject().apply{grade.results.forEach{(i,v)->put(i.toString(),v)}}
        val updated=JSONObject(data.toString()).put("answers",s.answers).put("submitted",true).put("results",results).put("score",grade.percent)
        val next=session.copy(wire=JSONObject(session.wire?.toString()?:"{}").put("examData",updated)); _state.value=s.copy(session=next,grade=grade)
        answerSaveJob?.cancel(); persistSerialized(next,"examData",updated)
    }
    fun submitDiagnostic() {
        val s=_state.value; val session=s.session?:return; val data=session.wire?.optJSONObject("tutorData")?:return; val questions=data.optJSONArray("questions")?:JSONArray()
        val(nodes,plan)=LearningModels.applyDiagnostic(session.topic,questions,s.answers)
        val updated=JSONObject(data.toString()).put("answers",s.answers).put("submitted",true)
        val wire=JSONObject(session.wire?.toString()?:"{}").put("tutorData",updated).put("kbNodes",nodes).put("teachingPlan",plan).put("phase","chat").put("teachingStage","motivate").put("currentNode",0).put("substantiveCount",0)
        val next=session.copy(wire=wire, phase="chat"); _state.value=s.copy(session=next); answerSaveJob?.cancel(); persistSerialized(next,"tutorData",updated)
    }
    private fun scheduleSave(session:ChatSession?,data:JSONObject) {
        if(session==null)return
        answerSaveJob?.cancel(); val id=session.id; val kind=if(session.kind=="exam")"examData" else "tutorData"; val epochAtSchedule=epoch
        answerSaveJob=viewModelScope.launch { delay(450); val current=_state.value.session?.takeIf{it.id==id}?:return@launch; val currentData=current.wire?.optJSONObject(kind)?:return@launch; currentData.put("answers",JSONObject(_state.value.answers.toString())); persistSerialized(current,kind,currentData,epochAtSchedule) }
    }
    private fun persistSerialized(session:ChatSession,key:String,data:JSONObject,expectedEpoch:Long=epoch, force:Boolean=false) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { saveMutex.withLock {
                    if(!force && expectedEpoch!=epoch)return@withLock
                    if (key == "tutorData") {
                        api.saveLearningDraft(owner, session.id, data)
                        val body = JSONObject().put("kind", "tutor").put("phase", session.phase)
                        listOf("kbNodes", "teachingPlan", "teachingStage", "currentNode", "practiceAttempts", "practicePhase").forEach { field ->
                            session.wire?.takeIf { it.has(field) }?.let { body.put(field, it.opt(field)) }
                        }
                        api.requestResource("PATCH", "sessions/${session.id}", body)
                    } else api.requestResource("PATCH","sessions/${session.id}",JSONObject().put(key,data).put("kind",session.kind))
                } }
            } catch (e: Exception) {
                if (expectedEpoch == epoch && e !is kotlinx.coroutines.CancellationException) _state.value = _state.value.copy(error = "尚未保存：${e.message ?: "网络错误"}；请保持本页并重试提交。")
            }
        }
    }
    fun flushAnswers() {
        answerSaveJob?.cancel()
        val s = _state.value; val session = s.session ?: return
        val key = if (session.kind == "exam") "examData" else "tutorData"
        val data = session.wire?.optJSONObject(key) ?: return
        persistSerialized(session, key, JSONObject(data.toString()).put("answers", JSONObject(s.answers.toString())), force=true)
    }
    fun retrySave() {
        val s = _state.value; val session = s.session ?: return
        val key = if(session.kind == "exam") "examData" else "tutorData"
        val data = session.wire?.optJSONObject(key) ?: return
        _state.value = s.copy(error = null)
        persistSerialized(session, key, JSONObject(data.toString()).put("answers", s.answers))
    }
    fun cancelGeneration(){epoch++; api.cancelStream(); generation?.cancel();generation=null;_state.value=_state.value.copy(busy=false)}
    fun open(session:ChatSession) { loadJob?.cancel(); epoch++; val data=session.wire?.optJSONObject(if(session.kind=="exam")"examData" else "tutorData")?:JSONObject(); val answers=JSONObject(data.optJSONObject("answers")?.toString()?:"{}"); val qs=LearningModels.examQuestions(data); val grade=if(session.kind=="exam"&&data.optBoolean("submitted"))LearningModels.grade(qs,answers)else null; _state.value=LearningState(session=session,answers=answers,grade=grade,total=if(session.kind=="exam")qs.size else data.optJSONArray("questions")?.length()?:0) }
    fun openById(id:String) {
        loadJob?.cancel(); val loadEpoch=++epoch; generation?.cancel(); _state.value=LearningState(busy=true)
        loadJob=viewModelScope.launch { try { val session=withContext(Dispatchers.IO){
            owner = api.currentUser().getString("id")
            val loaded = api.getSession(id)
            val draft = if (loaded.kind == "tutor") api.readLearningDraft(owner, id) else null
            if (draft == null) loaded else loaded.copy(wire=JSONObject(loaded.wire?.toString()?:"{}").put("tutorData",draft))
        }; if(loadEpoch==epoch)open(session) } catch(e:Exception){if(loadEpoch==epoch)_state.value=LearningState(error=e.message?:"无法打开学习会话")} }
    }
}
