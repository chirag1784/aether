package com.pramana.evidence.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Section 10: "deep indigo + warm off-white + a single amber accent for
// the integrity state. No skeuomorphic 'security badge' clip art."
val PramanaIndigo = Color(0xFF1B1F3B)
val PramanaIndigoLight = Color(0xFF2E345E)
val PramanaOffWhite = Color(0xFFF7F4EC)
val PramanaAmber = Color(0xFFD99E30)
val PramanaGreenClean = Color(0xFF2E7D32)
val PramanaAmberSuspect = Color(0xFFB8860B)
val PramanaRedSpoofed = Color(0xFFB3261E)

private val LightColors = lightColorScheme(
    primary = PramanaIndigo,
    onPrimary = PramanaOffWhite,
    secondary = PramanaAmber,
    onSecondary = PramanaIndigo,
    background = PramanaOffWhite,
    surface = PramanaOffWhite,
    error = PramanaRedSpoofed,
)

private val DarkColors = darkColorScheme(
    primary = PramanaIndigoLight,
    onPrimary = PramanaOffWhite,
    secondary = PramanaAmber,
    onSecondary = PramanaIndigo,
    background = Color(0xFF14172B),
    surface = Color(0xFF1B1F3B),
    error = PramanaRedSpoofed,
)

@Composable
fun PramanaTheme(darkTheme: Boolean = androidx.compose.foundation.isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
