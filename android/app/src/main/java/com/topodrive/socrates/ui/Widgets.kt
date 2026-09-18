package com.topodrive.socrates.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.topodrive.socrates.theme.LocalSocratesColors

/* Shared primitives mapping 1:1 onto the web shell's component styles —
 * 12px icon buttons, pill controls, 14px-radius cards, hairline borders. */

@Composable
fun IconBtn(
    icon: ImageVector,
    desc: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 36.dp,
    iconSize: Dp = 18.dp,
    tint: Color = LocalSocratesColors.current.textMuted,
    bg: Color = Color.Transparent,
) {
    Box(
        modifier
            .size(size)
            .clip(RoundedCornerShape(10.dp))
            .background(bg)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, desc, tint = tint, modifier = Modifier.size(iconSize))
    }
}

@Composable
fun SocButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    primary: Boolean = true,
    enabled: Boolean = true,
    small: Boolean = false,
    loading: Boolean = false,
) {
    val c = LocalSocratesColors.current
    val bg = when {
        !enabled -> c.surfaceRaised
        primary -> c.accent
        else -> c.surfaceRaised
    }
    val fg = when {
        !enabled -> c.textFaint
        primary -> c.onAccent
        else -> c.text
    }
    Box(
        modifier
            .clip(RoundedCornerShape(if (small) 10.dp else 12.dp))
            .background(bg)
            .clickable(enabled = enabled && !loading, onClick = onClick)
            .padding(horizontal = if (small) 14.dp else 20.dp, vertical = if (small) 8.dp else 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) CircularProgressIndicator(Modifier.size(16.dp), color = fg, strokeWidth = 2.dp)
        else Text(text, color = fg, fontSize = if (small) 13.sp else 15.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun SocField(
    value: String,
    onValue: (String) -> Unit,
    hint: String,
    modifier: Modifier = Modifier,
    singleLine: Boolean = true,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    leading: (@Composable () -> Unit)? = null,
    textSize: Float = 15f,
) {
    val c = LocalSocratesColors.current
    Row(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(c.surface)
            .border(1.dp, c.borderSubtle, RoundedCornerShape(12.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        leading?.invoke()
        BasicTextField(
            value = value,
            onValueChange = onValue,
            singleLine = singleLine,
            textStyle = TextStyle(color = c.text, fontSize = textSize.sp),
            cursorBrush = SolidColor(c.text),
            visualTransformation = visualTransformation,
            keyboardOptions = keyboardOptions,
            keyboardActions = keyboardActions,
            modifier = Modifier.fillMaxWidth(),
            decorationBox = { inner ->
                Box {
                    if (value.isEmpty()) Text(hint, color = c.textFaint, fontSize = textSize.sp)
                    inner()
                }
            },
        )
    }
}

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    val c = LocalSocratesColors.current
    Text(
        text.uppercase(),
        color = c.textFaint,
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 1.2.sp,
        modifier = modifier.padding(start = 12.dp, top = 18.dp, bottom = 6.dp),
    )
}

@Composable
fun EmptyState(icon: ImageVector, text: String, modifier: Modifier = Modifier) {
    val c = LocalSocratesColors.current
    Column(
        modifier.fillMaxWidth().padding(vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, null, tint = c.textFaint, modifier = Modifier.size(34.dp))
        Spacer(Modifier.height(12.dp))
        Text(text, color = c.textMuted, fontSize = 14.sp)
    }
}

@Composable
fun Divider(modifier: Modifier = Modifier) {
    val c = LocalSocratesColors.current
    Box(modifier.fillMaxWidth().height(1.dp).background(c.borderSubtle))
}

@Composable
fun SocCard(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val c = LocalSocratesColors.current
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(c.surface)
            .border(1.dp, c.borderSubtle, RoundedCornerShape(14.dp))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(14.dp),
        content = content,
    )
}

@Composable
fun TagPill(text: String, onClick: (() -> Unit)? = null, selected: Boolean = false) {
    val c = LocalSocratesColors.current
    Box(
        Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(if (selected) c.surfacePressed else c.surfaceRaised)
            .border(1.dp, if (selected) c.borderStrong else c.borderSubtle, RoundedCornerShape(999.dp))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 10.dp, vertical = 5.dp),
    ) {
        Text(text, color = if (selected) c.text else c.textMuted, fontSize = 12.sp)
    }
}

@Composable
fun Segmented(
    options: List<Pair<String, String>>, // id → label
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = LocalSocratesColors.current
    Row(
        modifier
            .clip(RoundedCornerShape(999.dp))
            .background(c.surfaceRaised)
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        for ((id, label) in options) {
            val sel = id == selected
            Box(
                Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(if (sel) c.surfacePressed else Color.Transparent)
                    .clickable { onSelect(id) }
                    .padding(horizontal = 14.dp, vertical = 6.dp),
            ) {
                Text(
                    label,
                    color = if (sel) c.text else c.textMuted,
                    fontSize = 13.sp,
                    fontWeight = if (sel) FontWeight.Medium else FontWeight.Normal,
                )
            }
        }
    }
}

@Composable
fun UserAvatar(name: String?, modifier: Modifier = Modifier, size: Dp = 28.dp) {
    val c = LocalSocratesColors.current
    val initial = name?.trim()?.firstOrNull()?.uppercase() ?: "?"
    Box(
        modifier
            .size(size)
            .clip(CircleShape)
            .background(c.surfacePressed)
            .border(1.dp, c.borderStrong, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(initial, color = c.text, fontSize = (size.value * 0.42f).sp, fontWeight = FontWeight.Medium)
    }
}

/** Bottom-sheet-style modal container used by every overlay in the app. */
@Composable
fun SheetScaffold(
    title: String,
    onClose: () -> Unit,
    trailing: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = LocalSocratesColors.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Row(
            Modifier.fillMaxWidth().padding(vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(title, color = c.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            trailing?.invoke()
            IconBtn(com.topodrive.socrates.icons.SocIcons.Close, "close", onClose)
        }
        content()
    }
}

@Composable
fun ListRow(
    title: String,
    subtitle: String? = null,
    icon: ImageVector? = null,
    trailing: (@Composable () -> Unit)? = null,
    titleColor: Color = LocalSocratesColors.current.text,
    onClick: (() -> Unit)? = null,
) {
    val c = LocalSocratesColors.current
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 10.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(icon, null, tint = c.textMuted, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(12.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(title, color = titleColor, fontSize = 14.sp, maxLines = 1)
            if (subtitle != null) Text(subtitle, color = c.textFaint, fontSize = 12.sp, maxLines = 1)
        }
        trailing?.invoke()
    }
}

@Composable
fun SettingsRow(title: String, subtitle: String? = null, control: @Composable () -> Unit) {
    val c = LocalSocratesColors.current
    Row(
        Modifier.fillMaxWidth().padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = c.text, fontSize = 14.sp)
            if (subtitle != null) Text(subtitle, color = c.textFaint, fontSize = 12.sp)
        }
        Spacer(Modifier.width(12.dp))
        control()
    }
}
