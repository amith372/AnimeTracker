package com.amith.animetracker.ui.seriesdetail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.amith.animetracker.data.repository.AnimeRepository
import com.amith.animetracker.domain.Series
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

sealed interface SeriesDetailUiState {
    data object Loading : SeriesDetailUiState
    data class Success(val series: Series) : SeriesDetailUiState
    data object NotFound : SeriesDetailUiState
}

class SeriesDetailViewModel(
    seriesId: Long,
    private val repository: AnimeRepository,
) : ViewModel() {

    val uiState: StateFlow<SeriesDetailUiState> = repository.observeSeries(seriesId)
        .map<Series?, SeriesDetailUiState> { series ->
            series?.let { SeriesDetailUiState.Success(it) } ?: SeriesDetailUiState.NotFound
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SeriesDetailUiState.Loading)

    init {
        // Opening the series' profile counts as having seen the new season.
        viewModelScope.launch { repository.setNewSeasonAvailable(seriesId, false) }
    }

    fun toggleWatched(entryId: Long, currentlyWatched: Boolean) {
        viewModelScope.launch { repository.setEntryWatched(entryId, !currentlyWatched) }
    }

    companion object {
        fun factory(seriesId: Long, repository: AnimeRepository) = viewModelFactory {
            initializer { SeriesDetailViewModel(seriesId, repository) }
        }
    }
}
