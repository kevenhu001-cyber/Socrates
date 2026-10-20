package com.socrates.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Keep the last (account/new-chat) item at the bottom only when all items fit.
 * LazyColumn uses normal scrolling once content exceeds its viewport, so neither
 * expanded search nor large type can push a fixed footer outside the window.
 */
internal object SidebarFooterArrangement : Arrangement.Vertical {
    override fun Density.arrange(totalSize: Int, sizes: IntArray, outPositions: IntArray) {
        var next = 0
        sizes.forEachIndexed { index, size ->
            outPositions[index] = if (index == sizes.lastIndex) maxOf(next, totalSize - size) else next
            next += size
        }
    }
}

/** Foundation-only segmented capsule. The two tabs own separate >=44dp targets;
 * the track's 4dp inset is decorative and does not shrink their touch bounds.
 */
@Composable
internal fun ChatModeSwitch(work: Boolean, onMode: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.height(IntrinsicSize.Min).clip(CircleShape).background(SocratesDesign.PillSelected)
        .selectableGroup().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
        listOf("聊天", "工作").forEachIndexed { index, label ->
            val mode = index == 1
            val selected = work == mode
            Box(Modifier.weight(1f).fillMaxHeight().heightIn(min = 44.dp)
                .shadow(if (selected) 2.dp else 0.dp, CircleShape, clip = false)
                .background(if (selected) Color.White else Color.Transparent, CircleShape)
                .clip(CircleShape)
                .selectable(selected = selected, role = Role.Tab, onClick = { if (!selected) onMode(mode) })
                .padding(horizontal = 12.dp, vertical = 8.dp), contentAlignment = Alignment.Center) {
                Text(label, fontSize = 14.sp, lineHeight = 20.sp,
                    fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
                    color = if (selected) SocratesDesign.Ink else SocratesDesign.Muted)
            }
        }
    }
}
