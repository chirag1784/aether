package com.pramana.evidence.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.pramana.evidence.data.AppPreferences
import com.pramana.evidence.ui.capture.CaptureScreen
import com.pramana.evidence.ui.export.ExportScreen
import com.pramana.evidence.ui.home.HomeScreen
import com.pramana.evidence.ui.onboarding.OnboardingScreen
import com.pramana.evidence.ui.preflight.PreflightScreen
import com.pramana.evidence.ui.review.ReviewScreen
import com.pramana.evidence.ui.session.NewSessionScreen
import com.pramana.evidence.ui.settings.SettingsScreen

object Routes {
    const val ONBOARDING = "onboarding"
    const val HOME = "home"
    const val NEW_SESSION = "new_session"
    const val PREFLIGHT = "preflight/{sessionId}"
    const val CAPTURE = "capture/{sessionId}"
    const val REVIEW = "review/{sessionId}"
    const val EXPORT = "export/{sessionId}"
    const val SETTINGS = "settings"

    fun preflight(sessionId: String) = "preflight/$sessionId"
    fun capture(sessionId: String) = "capture/$sessionId"
    fun review(sessionId: String) = "review/$sessionId"
    fun export(sessionId: String) = "export/$sessionId"
}

@Composable
fun PramanaNavHost(appPreferences: AppPreferences, navController: NavHostController = rememberNavController()) {
    val onboarded by appPreferences.onboardedFlow.collectAsState(initial = null)

    when (onboarded) {
        null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        else -> NavHost(
            navController = navController,
            startDestination = if (onboarded == true) Routes.HOME else Routes.ONBOARDING,
        ) {
            composable(Routes.ONBOARDING) {
                OnboardingScreen(onDone = {
                    navController.navigate(Routes.HOME) { popUpTo(Routes.ONBOARDING) { inclusive = true } }
                })
            }
            composable(Routes.HOME) {
                HomeScreen(
                    onNewSession = { navController.navigate(Routes.NEW_SESSION) },
                    onOpenSession = { sessionId -> navController.navigate(Routes.review(sessionId)) },
                    onSettings = { navController.navigate(Routes.SETTINGS) },
                )
            }
            composable(Routes.NEW_SESSION) {
                NewSessionScreen(
                    onCreated = { sessionId ->
                        navController.navigate(Routes.preflight(sessionId)) { popUpTo(Routes.HOME) }
                    },
                    onBack = { navController.popBackStack() },
                )
            }
            composable(Routes.PREFLIGHT) { backStackEntry ->
                val sessionId = backStackEntry.arguments?.getString("sessionId") ?: return@composable
                PreflightScreen(
                    sessionId = sessionId,
                    onReady = { navController.navigate(Routes.capture(sessionId)) { popUpTo(Routes.HOME) } },
                )
            }
            composable(Routes.CAPTURE) { backStackEntry ->
                val sessionId = backStackEntry.arguments?.getString("sessionId") ?: return@composable
                CaptureScreen(
                    sessionId = sessionId,
                    onDone = { navController.navigate(Routes.review(sessionId)) { popUpTo(Routes.HOME) } },
                )
            }
            composable(Routes.REVIEW) { backStackEntry ->
                val sessionId = backStackEntry.arguments?.getString("sessionId") ?: return@composable
                ReviewScreen(
                    sessionId = sessionId,
                    onAddMore = { navController.navigate(Routes.capture(sessionId)) },
                    onExport = { navController.navigate(Routes.export(sessionId)) },
                    onBack = { navController.popBackStack(Routes.HOME, inclusive = false) },
                )
            }
            composable(Routes.EXPORT) { backStackEntry ->
                val sessionId = backStackEntry.arguments?.getString("sessionId") ?: return@composable
                ExportScreen(sessionId = sessionId, onBack = { navController.popBackStack() })
            }
            composable(Routes.SETTINGS) {
                SettingsScreen(onBack = { navController.popBackStack() })
            }
        }
    }
}
