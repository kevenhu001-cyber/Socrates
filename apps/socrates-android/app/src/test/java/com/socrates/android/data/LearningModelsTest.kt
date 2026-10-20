package com.socrates.android.data

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class LearningModelsTest {
    @Test fun parsesGenericQuestionRowsAndDropsMalformedPrompts() {
        val rows=JSONObject("""{"questions":[{"q":"Pick","type":"multiple-choice","opts":[{"letter":"A","text":"one"}],"answer":"A"},{"q":""},{"q":"Blank","type":"fill-blank","answers":["A","alpha"]}]}""")
        val parsed=LearningModels.examQuestions(rows)
        assertEquals(2,parsed.size); assertEquals("one",parsed[0].options.single().second); assertEquals(2,parsed[1].index)
    }
    @Test fun countsAnswersAndGradesExamByCanonicalTypeRules() {
        val data=JSONObject("""{"questions":[{"q":"MC","type":"multiple-choice","opts":[{"letter":"A"},{"letter":"B"}],"answer":"B"},{"q":"Fill","type":"fill-blank","answers":["correct"]},{"q":"Short","type":"short-answer","answer":"mitochondria produces energy"}]}""")
        val qs=LearningModels.examQuestions(data); val partial=JSONObject().put("0",1).put("1","Correct")
        assertEquals(2,LearningModels.answeredCount(qs,partial)); val grade=LearningModels.grade(qs,JSONObject(partial.toString()).put("2","Mitochondria produces energy"))
        assertEquals(3,grade.correct); assertEquals(100,grade.percent)
        assertFalse(LearningModels.grade(qs,JSONObject().put("0",0)).results[0]!!)
    }
    @Test fun promptReflectsTopicDifficultyTypesAndUniqueness() {
        val prompt=LearningModels.examPrompt("Cell biology",5,"hard","short-answer","English","Use concise wording",2,listOf("What is a cell?"))
        assertTrue(prompt.contains("Cell biology")); assertTrue(prompt.contains("hard")); assertTrue(prompt.contains("short-answer")); assertTrue(prompt.contains("What is a cell?")); assertTrue(prompt.contains("Use concise wording"))
    }
    @Test fun diagnosticSubmissionCreatesDurableKnowledgeOutcome() {
        val choices=org.json.JSONArray().put(JSONObject().put("level","internalized")).put(JSONObject().put("level","fuzzy")).put(JSONObject().put("level","blank"))
        val qs=org.json.JSONArray().put(JSONObject().put("opts",choices)).put(JSONObject().put("opts",choices))
        val (nodes,plan)=LearningModels.applyDiagnostic("Algebra",qs,JSONObject().put("0",0).put("1",1))
        assertEquals("fuzzy",nodes.getJSONObject(0).getString("status")); assertEquals(1,nodes.getJSONObject(0).getJSONObject("selfAssessment").getInt("fuzzy")); assertEquals(1,nodes.getJSONObject(0).getJSONObject("selfAssessment").getInt("internalized")); assertEquals("Algebra",plan.getJSONArray("subtopics").getJSONObject(0).getString("name"))
    }

    @Test fun tutorVoiceAndProgressAreRealAndSessionScoped() {
        val session=ChatSession(topic="Algebra",mode="tutor",kind="tutor",wire=JSONObject().put("teachingStage","motivate").put("kbNodes",org.json.JSONArray().put(JSONObject().put("name","Linear equations"))))
        assertTrue(LearningModels.tutorSystemPrompt(session).contains("Socratic tutor"))
        val progressed=LearningModels.advanceTutorProgress(session,"I have a detailed understanding of this topic and can explain the underlying reasoning in my own words.")
        assertEquals("define",progressed.wire?.getString("teachingStage")); assertEquals(1,progressed.wire?.getInt("substantiveCount"))
        val chat=session.copy(kind="chat"); assertEquals(chat,LearningModels.advanceTutorProgress(chat,"hello"))
    }
}
