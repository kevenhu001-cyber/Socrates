plugins { id("com.android.application"); id("org.jetbrains.kotlin.android"); id("org.jetbrains.kotlin.plugin.compose") }
val repositoryRoot = rootProject.projectDir.resolve("../..")
val toolRendererAssets = layout.buildDirectory.dir("generated/toolRendererAssets")
val toolRendererVendorAssets = layout.buildDirectory.dir("generated/toolRendererVendorAssets")
val prepareToolRendererAssets by tasks.registering(Copy::class) {
    from(repositoryRoot.resolve("frontend/src/vendor-files")) {
        include("echarts.min.js", "mermaid.min.js", "plotly.min.js")
        into("vendor-files")
    }
    into(toolRendererVendorAssets)
}
val bundleToolRenderer by tasks.registering(Exec::class) {
    val output = toolRendererAssets.get().file("render/tool-renderer.js").asFile
    workingDir(repositoryRoot)
    commandLine(repositoryRoot.resolve("frontend/node_modules/.bin/esbuild").absolutePath,
        "apps/socrates-android/renderer/toolRendererEntry.ts",
        "--bundle", "--minify", "--format=esm", "--platform=browser", "--target=es2020",
        "--define:process.env.NODE_ENV=\"production\"", "--outfile=${output.absolutePath}")
    inputs.file(rootProject.file("renderer/toolRendererEntry.ts"))
    inputs.dir(repositoryRoot.resolve("frontend/src"))
    inputs.dir(repositoryRoot.resolve("frontend/node_modules/@socrates/core"))
    inputs.file(repositoryRoot.resolve("frontend/package-lock.json"))
    outputs.file(output)
    outputs.file(toolRendererAssets.get().file("render/tool-renderer.css"))
    doFirst { output.parentFile.mkdirs() }
}
android.sourceSets.getByName("main").assets.srcDir(toolRendererAssets)
android.sourceSets.getByName("main").assets.srcDir(toolRendererVendorAssets)
tasks.named("preBuild").configure { dependsOn(bundleToolRenderer, prepareToolRendererAssets) }
android {
 namespace = "com.socrates.android"; compileSdk = 35
 defaultConfig { applicationId = "com.socrates.android"; minSdk = 26; targetSdk = 35; versionCode = 5; versionName = "1.4"; testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner" }
 buildFeatures { compose = true; buildConfig = true }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 kotlinOptions { jvmTarget = "17" }
 packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
 buildTypes { debug { manifestPlaceholders["usesCleartextTraffic"] = "true" }; release { isMinifyEnabled = false; manifestPlaceholders["usesCleartextTraffic"] = "false" } }
}
dependencies {
 implementation("androidx.core:core-ktx:1.15.0")
 implementation("androidx.webkit:webkit:1.12.1")
 implementation("androidx.activity:activity-compose:1.10.1")
 implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
 implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
 implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
 implementation(platform("androidx.compose:compose-bom:2025.02.00"))
 implementation("androidx.compose.ui:ui"); implementation("androidx.compose.ui:ui-tooling-preview"); implementation("androidx.compose.foundation:foundation")
 implementation("androidx.compose.material3:material3"); implementation("androidx.compose.material:material-icons-extended")
 implementation("io.noties.markwon:core:4.6.2")
 implementation("io.noties.markwon:image:4.6.2")
 implementation("io.noties.markwon:inline-parser:4.6.2")
 implementation("io.noties.markwon:ext-latex:4.6.2")
 implementation("io.noties.markwon:ext-tables:4.6.2")
 implementation("io.noties.markwon:ext-strikethrough:4.6.2")
 implementation("io.noties.markwon:ext-tasklist:4.6.2")
 implementation("androidx.security:security-crypto:1.1.0-alpha06")
 implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1"); implementation("com.squareup.okhttp3:okhttp:4.12.0")
 debugImplementation("androidx.compose.ui:ui-tooling")
 testImplementation("junit:junit:4.13.2"); testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
 testImplementation("org.json:json:20240303")
 androidTestImplementation(platform("androidx.compose:compose-bom:2025.02.00")); androidTestImplementation("androidx.test.ext:junit:1.2.1"); androidTestImplementation("androidx.test:runner:1.6.2"); androidTestImplementation("androidx.compose.ui:ui-test-junit4")
 androidTestImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
 debugImplementation("androidx.compose.ui:ui-test-manifest")
}
