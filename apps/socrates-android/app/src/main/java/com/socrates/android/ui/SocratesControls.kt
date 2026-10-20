package com.socrates.android.ui

import androidx.compose.animation.core.*
import kotlinx.coroutines.launch
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.*
import androidx.compose.ui.window.*

/** Native reference geometry, normalized from 701 px captures to a 390 dp viewport.
 * System bars and the user's keyboard belong to Android, not the application.
 * Controls are built from Foundation rather than stock Material widgets.
 */
object SocratesDesign {
    // Native defaults follow the semantic neutral ramp in frontend/themes.css.
    val Ink = Color(0xFF1F1F1F)
    val Muted = Color(0xFF6B6B6B)
    val Blue = Color(0xFF3865EF)
    val Page = Color(0xFFF8F8F8)
    val Selected = Color(0xFFF5F5F5)
    val Line = Color(0xFFE3E3E3)
    val Focus = Color(0xFF595959)
    val Disabled = Color(0xFF8F8F8F)
    val Touch = 44.dp
    val PageGutter = 16.dp
    val HeaderHeight = 68.dp
    val ComposerInset = 34.dp
    val ComposerExpandedInset = 12.dp
}

@Composable
fun SocratesButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
    shape: Shape = CircleShape, containerColor: Color = SocratesDesign.Ink, contentColor: Color = Color.White,
    disabledContainerColor: Color = containerColor.copy(alpha = .16f), disabledContentColor: Color = contentColor.copy(alpha = .45f),
    contentPadding: PaddingValues = PaddingValues(horizontal = 22.dp, vertical = 13.dp),
    content: @Composable RowScope.() -> Unit) {
    val background = if (enabled) containerColor else disabledContainerColor
    val foreground = if (enabled) contentColor else disabledContentColor
    var focused by remember { mutableStateOf(false) }
    CompositionLocalProvider(LocalContentColor provides foreground) {
        ProvideTextStyle(MaterialTheme.typography.labelLarge) {
            Row(modifier.heightIn(min = 44.dp).clip(shape).background(background)
                .border(if (focused) 2.dp else 0.dp, if (focused) SocratesDesign.Focus else Color.Transparent, shape)
                .onFocusChanged { focused = it.isFocused }
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(contentPadding),
                horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically, content = content)
        }
    }
}

@Composable
fun SocratesTextButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
    contentPadding: PaddingValues = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
    content: @Composable RowScope.() -> Unit) {
    var focused by remember { mutableStateOf(false) }
    CompositionLocalProvider(LocalContentColor provides if (enabled) SocratesDesign.Ink else SocratesDesign.Disabled) {
        ProvideTextStyle(MaterialTheme.typography.labelLarge) {
            Row(modifier.heightIn(min = 44.dp).clip(CircleShape)
                .border(if (focused) 2.dp else 0.dp, if (focused) SocratesDesign.Focus else Color.Transparent, CircleShape)
                .onFocusChanged { focused = it.isFocused }
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(contentPadding), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center, content = content)
        }
    }
}

@Composable
fun SocratesOutlinedButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
    content: @Composable RowScope.() -> Unit) {
    SocratesTextButton(onClick, modifier.border(1.dp, SocratesDesign.Line, CircleShape), enabled, content = content)
}

@Composable
fun SocratesIconButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, content: @Composable () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    Box(modifier.sizeIn(minWidth = 44.dp, minHeight = 44.dp).clip(CircleShape)
        .border(if (focused) 2.dp else 0.dp, if (focused) SocratesDesign.Focus else Color.Transparent, CircleShape)
        .onFocusChanged { focused = it.isFocused }
        .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
        .semantics { if (!enabled) this.disabled() },
        contentAlignment = Alignment.Center) {
        CompositionLocalProvider(LocalContentColor provides if (enabled) LocalContentColor.current else SocratesDesign.Disabled) { content() }
    }
}

@Composable
fun SocratesField(value: String, onValueChange: (String) -> Unit, modifier: Modifier = Modifier,
    enabled: Boolean = true, label: (@Composable () -> Unit)? = null, placeholder: (@Composable () -> Unit)? = null,
    leadingIcon: (@Composable () -> Unit)? = null, trailingIcon: (@Composable () -> Unit)? = null,
    singleLine: Boolean = false, minLines: Int = 1, maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    shape: Shape = RoundedCornerShape(20.dp), visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default, keyboardActions: KeyboardActions = KeyboardActions.Default,
    isError: Boolean = false, supportingText: (@Composable () -> Unit)? = null) {
    var focused by remember { mutableStateOf(false) }
    Column(modifier.alpha(if (enabled) 1f else .45f).semantics {
        if (isError) error("输入有误")
        if (!enabled) this.disabled()
    }) {
        if (label != null) {
            CompositionLocalProvider(LocalContentColor provides SocratesDesign.Muted) { ProvideTextStyle(MaterialTheme.typography.bodySmall) { Box(Modifier.padding(start = 4.dp, bottom = 7.dp)) { label() } } }
        }
        BasicTextField(value, onValueChange, enabled = enabled, singleLine = singleLine, minLines = minLines,
            maxLines = maxLines, visualTransformation = visualTransformation, keyboardOptions = keyboardOptions, keyboardActions = keyboardActions,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = SocratesDesign.Ink), cursorBrush = SolidColor(SocratesDesign.Blue),
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).onFocusChanged { focused = it.isFocused },
            decorationBox = { inner ->
                Row(Modifier.fillMaxWidth().clip(shape).background(Color.White)
                    .border(if (focused) 2.dp else 1.dp, if (isError) Color(0xFFB02D1C) else if (focused) SocratesDesign.Focus else SocratesDesign.Line, shape)
                    .padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (leadingIcon != null) { CompositionLocalProvider(LocalContentColor provides SocratesDesign.Muted) { leadingIcon() }; Spacer(Modifier.width(12.dp)) }
                    Box(Modifier.weight(1f)) {
                        if (value.isEmpty() && placeholder != null) CompositionLocalProvider(LocalContentColor provides SocratesDesign.Muted) { placeholder() }
                        inner()
                    }
                    if (trailingIcon != null) { Spacer(Modifier.width(8.dp)); trailingIcon() }
                }
            })
        if (supportingText != null) Box(Modifier.padding(start = 4.dp, top = 6.dp)) { supportingText() }
    }
}

@Composable
fun SocratesFilterChip(selected: Boolean, onClick: () -> Unit, label: @Composable () -> Unit,
    modifier: Modifier = Modifier, enabled: Boolean = true) {
    CompositionLocalProvider(LocalContentColor provides if (selected) SocratesDesign.Ink else SocratesDesign.Muted) {
        ProvideTextStyle(MaterialTheme.typography.titleMedium.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)) {
            Box(modifier.heightIn(min = 44.dp).clip(CircleShape).background(if (selected) SocratesDesign.Selected else Color.Transparent)
                .selectable(selected, enabled = enabled, role = Role.Tab, onClick = onClick).padding(horizontal = 16.dp, vertical = 11.dp), contentAlignment = Alignment.Center) { label() }
        }
    }
}

@Composable
fun SocratesInputChip(selected: Boolean, onClick: () -> Unit, label: @Composable () -> Unit,
    leadingIcon: (@Composable () -> Unit)? = null, trailingIcon: (@Composable () -> Unit)? = null) {
    Row(Modifier.padding(bottom = 8.dp).clip(RoundedCornerShape(18.dp)).background(Color.White)
        .border(1.dp, SocratesDesign.Line, RoundedCornerShape(18.dp)).selectable(selected, role = Role.Button, onClick = onClick)
        .padding(start = 12.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        leadingIcon?.invoke(); Spacer(Modifier.width(8.dp)); Box(Modifier.weight(1f, fill = false)) { label() }; trailingIcon?.invoke()
    }
}

@Composable
fun SocratesCard(modifier: Modifier = Modifier, shape: Shape = RoundedCornerShape(22.dp),
    containerColor: Color = Color.White, contentColor: Color = SocratesDesign.Ink,
    disabledContainerColor: Color = containerColor, disabledContentColor: Color = contentColor.copy(alpha = .45f),
    onClick: (() -> Unit)? = null, enabled: Boolean = true, content: @Composable ColumnScope.() -> Unit) {
    val base = modifier.clip(shape).background(if (enabled) containerColor else disabledContainerColor)
    CompositionLocalProvider(LocalContentColor provides if (enabled) contentColor else disabledContentColor) {
        val cardModifier = if (onClick != null) base.clickable(enabled = enabled, role = Role.Button) { onClick() } else base
        Column(cardModifier, content = content)
    }
}

@Composable
fun SocratesOutlinedCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    SocratesCard(modifier.border(1.dp, SocratesDesign.Line, RoundedCornerShape(22.dp)), content = content)
}

private object MenuPosition : PopupPositionProvider {
    override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize, layoutDirection: LayoutDirection, popupContentSize: IntSize): IntOffset {
        val x = if (layoutDirection == LayoutDirection.Ltr) anchorBounds.right - popupContentSize.width else anchorBounds.left
        val y = anchorBounds.top
        return IntOffset(x.coerceIn(0, (windowSize.width - popupContentSize.width).coerceAtLeast(0)), y.coerceIn(0, (windowSize.height - popupContentSize.height).coerceAtLeast(0)))
    }
}

@Composable
fun SocratesMenu(expanded: Boolean, onDismissRequest: () -> Unit, modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(26.dp), containerColor: Color = Color.White, content: @Composable ColumnScope.() -> Unit) {
    if (expanded) Popup(popupPositionProvider = MenuPosition, onDismissRequest = onDismissRequest, properties = PopupProperties(focusable = true)) {
        Column(modifier.widthIn(min = 220.dp, max = 300.dp).heightIn(max = 520.dp).shadow(18.dp, shape).clip(shape)
            .background(containerColor).verticalScroll(rememberScrollState()).padding(vertical = 12.dp), content = content)
    }
}

@Composable
fun SocratesMenuItem(text: @Composable () -> Unit, onClick: () -> Unit,
    modifier: Modifier = Modifier, leadingIcon: (@Composable () -> Unit)? = null, trailingIcon: (@Composable () -> Unit)? = null, enabled: Boolean = true) {
    Row(modifier.fillMaxWidth().heightIn(min = 48.dp).alpha(if (enabled) 1f else .35f).clickable(enabled = enabled, role = Role.Button, onClick = onClick)
        .padding(horizontal = 24.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        if (leadingIcon != null) { Box(Modifier.size(24.dp), contentAlignment = Alignment.Center) { leadingIcon() }; Spacer(Modifier.width(20.dp)) }
        Box(Modifier.weight(1f)) { ProvideTextStyle(MaterialTheme.typography.bodyLarge) { text() } }
        trailingIcon?.invoke()
    }
}

@Composable
fun SocratesAlert(onDismissRequest: () -> Unit, confirmButton: @Composable () -> Unit,
    modifier: Modifier = Modifier, title: (@Composable () -> Unit)? = null, text: (@Composable () -> Unit)? = null,
    dismissButton: (@Composable () -> Unit)? = null) {
    Dialog(onDismissRequest, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(modifier.widthIn(max = 440.dp).fillMaxWidth().padding(20.dp).clip(RoundedCornerShape(28.dp)).background(Color.White)
            .padding(24.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            if (title != null) ProvideTextStyle(MaterialTheme.typography.headlineSmall) { title() }
            if (text != null) Box(Modifier.heightIn(max = 340.dp).verticalScroll(rememberScrollState())) { text() }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) { dismissButton?.invoke(); Spacer(Modifier.width(8.dp)); confirmButton() }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SocratesSheet(onDismissRequest: () -> Unit, modifier: Modifier = Modifier,
    containerColor: Color = Color.White, sheetState: SheetState? = null, content: @Composable ColumnScope.() -> Unit) {
    // SheetState is accepted for source compatibility. Dismissal remains owned by each caller,
    // including its busy guard. No stock Material sheet, shape or drag handle is rendered.
    Dialog(onDismissRequest, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing), contentAlignment = Alignment.BottomCenter) {
            Box(Modifier.matchParentSize().clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onDismissRequest))
            Column(modifier.widthIn(max = 600.dp).fillMaxWidth().heightIn(max = 720.dp).clip(RoundedCornerShape(topStart = 30.dp, topEnd = 30.dp))
                .background(containerColor).padding(top = 10.dp)) {
                Box(Modifier.align(Alignment.CenterHorizontally).size(34.dp, 4.dp).background(Color(0xFFDDDDDD), CircleShape))
                content()
            }
        }
    }
}

@Composable
fun SocratesSwitch(checked: Boolean, onCheckedChange: (Boolean) -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val offset by animateDpAsState(if (checked) 20.dp else 2.dp, label = "switch")
    Box(modifier.size(50.dp, 44.dp).clip(CircleShape).toggleable(checked, enabled = enabled, role = Role.Switch, onValueChange = onCheckedChange), contentAlignment = Alignment.Center) {
        Box(Modifier.size(46.dp, 28.dp).background(
            when { !enabled -> SocratesDesign.Line; checked -> SocratesDesign.Ink; else -> Color(0xFFDDDDDD) }, CircleShape)) {
            Box(Modifier.offset { IntOffset(offset.roundToPx(), 2.dp.roundToPx()) }.size(24.dp)
                .background(if (enabled) Color.White else SocratesDesign.Disabled, CircleShape))
        }
    }
}

@Composable
fun SocratesRadio(selected: Boolean, onClick: (() -> Unit)?, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val control = if (onClick == null) modifier.size(44.dp).semantics { this.selected = selected; role = Role.RadioButton }
        else modifier.size(44.dp).selectable(selected, enabled = enabled, role = Role.RadioButton, onClick = onClick)
    Canvas(control) {
        val radioColor = if (enabled) SocratesDesign.Ink else SocratesDesign.Disabled
        drawCircle(if (selected) radioColor else SocratesDesign.Line, 10.dp.toPx(), style = Stroke(1.5.dp.toPx()))
        if (selected) drawCircle(radioColor, 5.dp.toPx())
    }
}

@Composable
fun SocratesSpinner(modifier: Modifier = Modifier, color: Color = SocratesDesign.Muted, strokeWidth: Dp = 2.dp) {
    val transition = rememberInfiniteTransition(label = "loading")
    val angle by transition.animateFloat(0f, 360f, infiniteRepeatable(tween(900, easing = LinearEasing)), label = "spin")
    Canvas(modifier.size(24.dp).semantics { contentDescription = "正在加载"; progressBarRangeInfo = ProgressBarRangeInfo.Indeterminate }) {
        drawArc(color.copy(alpha = .15f), 0f, 360f, false, style = Stroke(strokeWidth.toPx(), cap = StrokeCap.Round))
        drawArc(color, angle, 90f, false, style = Stroke(strokeWidth.toPx(), cap = StrokeCap.Round))
    }
}

@Composable
fun SocratesProgress(progress: () -> Float, modifier: Modifier = Modifier) {
    val value = progress().coerceIn(0f, 1f)
    Canvas(modifier.fillMaxWidth().height(3.dp).semantics { progressBarRangeInfo = ProgressBarRangeInfo(value, 0f..1f) }) {
        drawLine(SocratesDesign.Line, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), size.height, StrokeCap.Round)
        drawLine(SocratesDesign.Blue, Offset(0f, size.height / 2), Offset(size.width * value, size.height / 2), size.height, StrokeCap.Round)
    }
}

@Stable
class SocratesDrawerState {
    var isOpen by mutableStateOf(false)
        private set
    fun open() { isOpen = true }
    fun close() { isOpen = false }
}

@Composable
fun rememberSocratesDrawerState(): SocratesDrawerState = remember { SocratesDrawerState() }

@Composable
fun SocratesNavigationDrawer(drawerState: SocratesDrawerState, gesturesEnabled: Boolean = true,
    scrimColor: Color = Color.Black.copy(alpha = .48f), drawerContent: @Composable () -> Unit, content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize()) {
        content()
        if (gesturesEnabled && !drawerState.isOpen) Box(Modifier.align(Alignment.CenterStart).width(16.dp).fillMaxHeight().pointerInput(drawerState) {
            var distance = 0f
            detectHorizontalDragGestures(onDragStart = { distance = 0f }, onHorizontalDrag = { change, amount ->
                distance += amount
                if (distance > 48.dp.toPx()) { change.consume(); drawerState.open() }
            })
        })
    }
    if (drawerState.isOpen) {
        Dialog(onDismissRequest = drawerState::close, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
            val gesture = if (!gesturesEnabled) Modifier else Modifier.pointerInput(drawerState) {
                var distance = 0f
                detectHorizontalDragGestures(onDragStart = { distance = 0f }, onHorizontalDrag = { change, amount ->
                    distance += amount
                    if (distance < -64.dp.toPx()) { change.consume(); drawerState.close() }
                })
            }
            Box(Modifier.fillMaxSize().then(gesture)) {
                // This dialog owns focus/back trapping; there is no stock drawer or platform scrim.
                val view = androidx.compose.ui.platform.LocalView.current
                SideEffect { (view.parent as? DialogWindowProvider)?.window?.setDimAmount(0f) }
                Box(Modifier.matchParentSize().background(scrimColor).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = drawerState::close))
                drawerContent()
            }
        }
    }
}

@Composable
fun SocratesDrawerSheet(modifier: Modifier = Modifier, drawerContainerColor: Color = Color.White,
    drawerShape: Shape = RoundedCornerShape(0.dp), windowInsets: WindowInsets = WindowInsets(0, 0, 0, 0),
    content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxHeight().clip(drawerShape).background(drawerContainerColor).windowInsetsPadding(windowInsets), content = content)
}

@Composable
fun SocratesDivider(modifier: Modifier = Modifier, color: Color = SocratesDesign.Line, thickness: Dp = 1.dp) {
    Box(modifier.fillMaxWidth().height(thickness).background(color))
}

@Composable
fun SocratesTabs(selectedTabIndex: Int, modifier: Modifier = Modifier, tabs: @Composable () -> Unit) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) { tabs() }
}

@Composable
fun SocratesTab(selected: Boolean, onClick: () -> Unit, text: @Composable () -> Unit) {
    SocratesFilterChip(selected, onClick, label = text)
}

@Composable
fun SocratesSnackbarHost(hostState: SnackbarHostState, modifier: Modifier = Modifier) {
    val data = hostState.currentSnackbarData
    LaunchedEffect(data) {
        if (data != null && data.visuals.duration != SnackbarDuration.Indefinite) {
            val duration = when (data.visuals.duration) {
                SnackbarDuration.Short -> 4000L
                SnackbarDuration.Long -> 10000L
                SnackbarDuration.Indefinite -> null
            }
            if (duration != null) kotlinx.coroutines.delay(duration)
            data.dismiss()
        }
    }
    if (data != null) Row(modifier.widthIn(max = 520.dp).fillMaxWidth().shadow(6.dp, RoundedCornerShape(22.dp))
        .clip(RoundedCornerShape(22.dp)).background(SocratesDesign.Ink).padding(start = 18.dp, end = 8.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(data.visuals.message, Modifier.weight(1f), color = Color.White, style = MaterialTheme.typography.bodyMedium)
        val actionLabel = data.visuals.actionLabel
        if (actionLabel != null) {
            SocratesTextButton(onClick = data::performAction) {
                Text(actionLabel, color = Color.White, maxLines = 1)
            }
        }
        SocratesIconButton(onClick = data::dismiss) { ReferenceIcon(ReferenceGlyph.Close, "关闭提示", tint = Color.White) }
    }
}
