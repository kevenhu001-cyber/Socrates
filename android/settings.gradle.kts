pluginManagement {
    repositories {
        // Prefer China Maven mirrors (this project's maintainers build from
        // CN networks — see mobile/gradle-init-china.gradle); official
        // repositories remain as fallbacks for artifacts not mirrored.
        maven("https://maven.aliyun.com/repository/gradle-plugin")
        maven("https://maven.aliyun.com/repository/google")
        maven("https://maven.aliyun.com/repository/public")
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        maven("https://maven.aliyun.com/repository/google")
        maven("https://maven.aliyun.com/repository/public")
        maven("https://mirrors.cloud.tencent.com/repository/maven/google")
        maven("https://mirrors.cloud.tencent.com/repository/maven/public")
        google()
        mavenCentral()
    }
}
rootProject.name = "socrates-android"
include(":app")
