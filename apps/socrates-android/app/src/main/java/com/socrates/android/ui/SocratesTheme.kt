package com.socrates.android.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private fun nativeType(size: Int, line: Int, weight: FontWeight = FontWeight.Normal) = TextStyle(
    fontFamily = FontFamily.SansSerif, fontSize = size.sp, lineHeight = line.sp,
    fontWeight = weight, letterSpacing = 0.sp,
)

/** Every typography role is explicit, including roles used only by secondary screens. */
private val NativeTypography = Typography(
    displayLarge = nativeType(42, 52, FontWeight.SemiBold),
    displayMedium = nativeType(36, 46, FontWeight.SemiBold),
    displaySmall = nativeType(32, 42, FontWeight.SemiBold),
    headlineLarge = nativeType(32, 42, FontWeight.SemiBold),
    headlineMedium = nativeType(30, 40, FontWeight.SemiBold),
    headlineSmall = nativeType(23, 32, FontWeight.SemiBold),
    titleLarge = nativeType(19, 27, FontWeight.SemiBold),
    titleMedium = nativeType(17, 25, FontWeight.Medium),
    titleSmall = nativeType(16, 23, FontWeight.Medium),
    bodyLarge = nativeType(16, 24),
    bodyMedium = nativeType(14, 21),
    bodySmall = nativeType(12, 18),
    labelLarge = nativeType(15, 22, FontWeight.Medium),
    labelMedium = nativeType(13, 19, FontWeight.Medium),
    labelSmall = nativeType(11, 16, FontWeight.Medium),
)

private val NativeShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp), small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(20.dp), large = RoundedCornerShape(28.dp),
    extraLarge = RoundedCornerShape(32.dp),
)

@Composable
fun SocratesTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Color(0xFF222222), onPrimary = Color.White,
            primaryContainer = Color(0xFFEAEAEA), onPrimaryContainer = Color(0xFF111111), inversePrimary = Color.White,
            secondary = Color(0xFF3865EF), onSecondary = Color.White,
            secondaryContainer = Color(0xFFF0F0F0), onSecondaryContainer = Color(0xFF111111),
            tertiary = Color(0xFF666666), onTertiary = Color.White,
            tertiaryContainer = Color(0xFFF1F3FA), onTertiaryContainer = Color(0xFF202020),
            background = Color(0xFFF8F8F8), onBackground = Color(NativeReadingColors.textPrimary),
            surface = Color.White, onSurface = Color(NativeReadingColors.textPrimary),
            surfaceVariant = Color(0xFFF5F5F5), onSurfaceVariant = Color(NativeReadingColors.textTertiary), surfaceTint = Color.Transparent,
            inverseSurface = Color(0xFF161616), inverseOnSurface = Color.White,
            surfaceBright = Color.White, surfaceDim = Color(0xFFFBFBFB),
            surfaceContainerLowest = Color.White, surfaceContainerLow = Color(0xFFFBFBFB),
            surfaceContainer = Color(0xFFF5F5F5), surfaceContainerHigh = Color(0xFFEEEEEE), surfaceContainerHighest = Color(0xFFE3E3E3),
            error = Color(0xFFB3261E), onError = Color.White,
            errorContainer = Color(0xFFFFECEA), onErrorContainer = Color(0xFF721C16),
            outline = Color(NativeReadingColors.textSecondary), outlineVariant = Color(NativeReadingColors.borderDefault), scrim = Color.Black,
        ),
        typography = NativeTypography, shapes = NativeShapes, content = content,
    )
}
