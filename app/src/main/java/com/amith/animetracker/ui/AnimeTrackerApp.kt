package com.amith.animetracker.ui

import android.net.Uri
import android.widget.Toast
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.amith.animetracker.data.auth.AuthRepository
import com.amith.animetracker.data.repository.AnimeRepository
import com.amith.animetracker.data.repository.DiscoverRepository
import com.amith.animetracker.data.repository.ImportRepository
import com.amith.animetracker.ui.discover.DiscoverScreen
import com.amith.animetracker.ui.discover.DiscoverViewModel
import com.amith.animetracker.ui.library.LibraryScreen
import com.amith.animetracker.ui.library.LibraryViewModel
import com.amith.animetracker.ui.onboarding.LoginScreen
import com.amith.animetracker.ui.onboarding.ReconcileScreen
import com.amith.animetracker.ui.onboarding.ReconcileViewModel
import com.amith.animetracker.ui.seriesdetail.SeriesDetailScreen
import com.amith.animetracker.ui.seriesdetail.SeriesDetailViewModel
import com.amith.animetracker.work.SyncWorker

@Composable
fun AnimeTrackerApp(
    repository: AnimeRepository,
    authRepository: AuthRepository,
    importRepository: ImportRepository,
    discoverRepository: DiscoverRepository,
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
        MainNavigation(repository, discoverRepository)
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

private sealed interface Route {
    data object Library : Route
    data class Detail(val seriesId: Long) : Route
    data object Discover : Route
}

@Composable
private fun MainNavigation(repository: AnimeRepository, discoverRepository: DiscoverRepository) {
    var route by remember { mutableStateOf<Route>(Route.Library) }

    when (val current = route) {
        is Route.Library -> {
            val viewModel: LibraryViewModel = viewModel(factory = LibraryViewModel.factory(repository))
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            val context = LocalContext.current
            LibraryScreen(
                uiState = uiState,
                onSeriesClick = { route = Route.Detail(it) },
                onDiscoverClick = { route = Route.Discover },
                onSyncClick = {
                    WorkManager.getInstance(context).enqueue(OneTimeWorkRequestBuilder<SyncWorker>().build())
                    Toast.makeText(context, "Checking for new seasons...", Toast.LENGTH_SHORT).show()
                },
            )
        }

        is Route.Detail -> {
            val viewModel: SeriesDetailViewModel = viewModel(
                key = "series-detail-${current.seriesId}",
                factory = SeriesDetailViewModel.factory(current.seriesId, repository),
            )
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            SeriesDetailScreen(
                uiState = uiState,
                onBack = { route = Route.Library },
                onToggleWatched = viewModel::toggleWatched,
            )
        }

        is Route.Discover -> {
            val viewModel: DiscoverViewModel = viewModel(factory = DiscoverViewModel.factory(discoverRepository, repository))
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            val selectedTab by viewModel.selectedTab.collectAsStateWithLifecycle()
            val searchQuery by viewModel.searchQuery.collectAsStateWithLifecycle()
            DiscoverScreen(
                uiState = uiState,
                selectedTab = selectedTab,
                searchQuery = searchQuery,
                onTabSelected = viewModel::selectTab,
                onSearchQueryChange = viewModel::onSearchQueryChange,
                onSearchSubmit = viewModel::onSearchSubmit,
                onAdd = viewModel::addSeries,
                onBack = { route = Route.Library },
            )
        }
    }
}
