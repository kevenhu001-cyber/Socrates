package com.socrates.android.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class NativeReadingTypographyTest {
    @Test fun keepsRoundedNativeBodySizeAndMobileWebRatio() {
        assertEquals(17f, NativeReadingTypography.bodySizeSp, 0f)
        assertEquals(1.65f, NativeReadingTypography.bodyLineHeightRatio, 0f)
        assertEquals(28.05f, NativeReadingTypography.bodyLineHeightSp, .0001f)
    }

    @Test fun spacingUsesActualFontHeightNotNominalTextSize() {
        val spacing = NativeReadingTypography.extraLineSpacingPx(17f, 20f)
        assertEquals(8.05f, spacing, .0001f)
        assertEquals(28.05f, 20f + spacing, .0001f)
    }

    @Test fun differentFontsShareTargetWithoutCompressingTallFonts() {
        for (height in listOf(16f, 20f, 24f, 28f)) {
            assertEquals(28.05f, height + NativeReadingTypography.extraLineSpacingPx(17f, height), .0001f)
        }
        assertEquals(0f, NativeReadingTypography.extraLineSpacingPx(17f, 32f), 0f)
    }

    @Test fun densityAndFontScalingScaleSpacingInPixels() {
        for (scale in listOf(.85f, 1f, 1.3f, 2f, 3f)) {
            assertEquals(8.05f * scale,
                NativeReadingTypography.extraLineSpacingPx(17f * scale, 20f * scale), .0001f)
        }
    }
}
