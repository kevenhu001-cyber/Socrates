package com.topodrive.socrates.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.topodrive.socrates.R
import com.topodrive.socrates.icons.SocIcons
import com.topodrive.socrates.theme.LocalSocratesColors
import com.topodrive.socrates.theme.NewsreaderFamily
import com.topodrive.socrates.vm.AppState

/**
 * Home landing — port of `#homeScreen`: Newsreader serif greeting, quick
 * action chips (upload / write / research), and the Socratic disclaimer.
 * The composer itself is bottom-anchored in AppRoot — the Android idiom —
 * while keeping the web card's visuals.
 */
@Composable
fun HomeScreen(app: AppState, onPickImage: () -> Unit) {
    val c = LocalSocratesColors.current
    val user by app.user.collectAsState()

    val greeting = greetingFor(user?.displayName)

    Column(Modifier.fillMaxSize().padding(horizontal = 20.dp)) {
        Spacer(Modifier.height(28.dp))
        Text(
            greeting,
            color = c.text,
            fontFamily = NewsreaderFamily,
            fontWeight = FontWeight.Medium,
            fontSize = 30.sp,
            lineHeight = 38.sp,
        )
        Spacer(Modifier.height(22.dp))

        // Quick actions — upload / write / research
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            QuickAction(SocIcons.Upload, stringResource(R.string.home_quick_upload)) { onPickImage() }
            QuickAction(SocIcons.EditWrite, stringResource(R.string.home_quick_write)) {
                app.prefillComposer("Help me write ")
            }
            QuickAction(SocIcons.Research, stringResource(R.string.home_quick_research)) {
                app.prefillComposer("Research ")
            }
        }

        Spacer(Modifier.weight(1f))
        Text(
            stringResource(R.string.home_disclaimer),
            color = c.textFaint,
            fontSize = 12.sp,
            modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
        )
    }
}

@Composable
private fun QuickAction(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    val c = LocalSocratesColors.current
    Row(
        Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(c.surface)
            .border(1.dp, c.borderSubtle, RoundedCornerShape(999.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = c.textMuted, modifier = Modifier.size(15.dp))
        Spacer(Modifier.width(7.dp))
        Text(label, color = c.textSecondary, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}

private fun greetingFor(name: String?): String {
    val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
    val part = when (hour) {
        in 5..11 -> "morning"
        in 12..17 -> "afternoon"
        else -> "evening"
    }
    return if (!name.isNullOrBlank()) "Good $part, $name" else "Good $part"
}
