package com.socrates.android.ui

import com.socrates.android.data.FeatureModels
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class FeatureDirectoryModelsTest {
    @Test fun queryFiltersOnlyTitleAndDescriptionCaseInsensitively() {
        val items = FeatureModels.items(JSONObject("""{"plugins":[{"id":"a","name":"Alpha","description":"Cloud sync"},{"id":"b","name":"Beta","description":"Local"}]}"""), "plugins", listOf("name"))
        assertEquals(listOf("a"), FeatureDirectoryModels.filter(items, "CLOUD", "插件", "", "全部").map { it.id })
    }
    @Test fun tasksUseActualStatusField() {
        val items = FeatureModels.items(JSONObject("""{"tasks":[{"id":"a","title":"A","status":"active"},{"id":"b","title":"B","status":"paused"},{"id":"c","title":"C","status":"completed"}]}"""), "tasks", listOf("title"))
        assertEquals(listOf("a"), FeatureDirectoryModels.filter(items, "", "定时任务", "已开启", "全部").map { it.id })
        assertEquals(listOf("b"), FeatureDirectoryModels.filter(items, "", "定时任务", "已暂停", "全部").map { it.id })
        assertEquals(listOf("c"), FeatureDirectoryModels.filter(items, "", "定时任务", "已完成", "全部").map { it.id })
    }
    @Test fun libraryFiltersFavoriteAndFolderOnlyFromServerFields() {
        val items = FeatureModels.items(JSONObject("""{"files":[{"id":"f","name":"file","mimeType":"application/pdf","favorite":true},{"id":"d","name":"folder","kind":"folder"}]}"""), "files", listOf("name"))
        assertEquals(listOf("f"), FeatureDirectoryModels.filter(items, "", "资料库", "", "收藏").map { it.id })
        assertEquals(listOf("d"), FeatureDirectoryModels.filter(items, "", "资料库", "", "文件夹").map { it.id })
    }

    @Test fun libraryImageFilterUsesMimeNotFilenameOrInventedFolderTags() {
        val items = FeatureModels.items(JSONObject("""{"files":[{"id":"a","name":"document","mimeType":"image/png"},{"id":"b","name":"photo.png","mimeType":"application/pdf"},{"id":"c","name":"photo","mime":"image/jpeg"}]}"""), "files", listOf("name"))
        assertEquals(listOf("a", "b", "c"), FeatureDirectoryModels.filter(items, "", "资料库", "", "图像").map { it.id })
    }

    @Test fun projectsClassifyOnlyExplicitShareMarkers() {
        val items = FeatureModels.items(JSONObject("""{"projects":[{"id":"a","name":"A"},{"id":"b","name":"B","visibility":"shared"}]}"""), "projects", listOf("name"))
        assertEquals(listOf("a"), FeatureDirectoryModels.filter(items, "", "项目", "", "", "我创建的").map { it.id })
        assertEquals(listOf("b"), FeatureDirectoryModels.filter(items, "", "项目", "", "", "与你共享").map { it.id })
    }
}
