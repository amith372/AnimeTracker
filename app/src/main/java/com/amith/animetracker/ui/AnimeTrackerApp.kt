package com.amith.animetracker.ui

import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.amith.animetracker.data.auth.AuthRepository
import com.amith.animetracker.data.repository.AnimeRepository
import com.amith.animetracker.data.repository.ImportRepository
import com.amith.animetracker.ui.library.LibraryScreen
import com.amith.animetracker.ui.library.LibraryViewModel
import com.amith.animetracker.ui.onboarding.LoginScreen
import com.amith.animetracker.ui.onboarding.ReconcileScreen
import com.amith.animetracker.ui.onboarding.ReconcileViewModel
import com.amith.animetracker.ui.seriesdetail.SeriesDetailScreen
import com.amith.animetracker.ui.seriesdetail.SeriesDetailViewModel

@Composable
fun AnimeTrackerApp(
    repository: AnimeRepository,
    authRepository: AuthRepository,
    importRepository: ImportRepository,
) {
    val isLoggedIn by authRepository.isLoggedIn.collectAsStateWithLifecycle()

    if (!isLoggedIn) {
        val context = LocalContext.current
        LoginScreen(
            onLoginClick = {
                val authorizeUrl = authRepository.startLogin()
                CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse(authorizeUrl))
            }
        )
        return
    }

    val hasCompletedInitialImport by repository.hasCompletedInitialImport.collectAsStateWithLifecycle(initialValue = false)
    if (hasCompletedInitialImport) {
        LibraryAndDetail(repository)
    } else {
        val viewModel: ReconcileViewModel = viewModel(factory = ReconcileViewModel.factory(importRepository, repository))
        val uiState by viewModel.uiState.collectAsStateWithLifecycle()
        ReconcileScreen(
            uiState = uiState,
            onToggleEntry = viewModel::toggleEntry,
            onConfirm = viewModel::confirmImport,
            onRetry = viewModel::startImport,
        )
    }
}

@Composable
private fun LibraryAndDetail(repository: AnimeRepository) {
    var selectedSeriesId by remember { mutableStateOf<Long?>(null) }

    val currentSeriesId = selectedSeriesId
    if (currentSeriesId == null) {
        val viewModel: LibraryViewModel = viewModel(factory = LibraryViewModel.factory(repository))
        val uiState by viewModel.uiState.collectAsStateWithLifecycle()
        LibraryScreen(
            uiState = uiState,
            onSeriesClick = { selectedSeriesId = it },
        )
    } else {
        val viewModel: SeriesDetailViewModel = viewModel(
            key = "series-detail-$currentSeriesId",
            factory = SeriesDetailViewModel.factory(currentSeriesId, repository),
        )
        val uiState by viewModel.uiState.collectAsStateWithLifecycle()
        SeriesDetailScreen(
            uiState = uiState,
            onBack = { selectedSeriesId = null },
            onToggleWatched = viewModel::toggleWatched,
        )
    }
}
