package com.amith.animetracker.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.amith.animetracker.data.repository.AnimeRepository
import com.amith.animetracker.ui.library.LibraryScreen
import com.amith.animetracker.ui.library.LibraryViewModel
import com.amith.animetracker.ui.seriesdetail.SeriesDetailScreen
import com.amith.animetracker.ui.seriesdetail.SeriesDetailViewModel

@Composable
fun AnimeTrackerApp(repository: AnimeRepository) {
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
