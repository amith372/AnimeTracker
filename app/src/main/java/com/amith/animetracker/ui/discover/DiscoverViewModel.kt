package com.amith.animetracker.ui.discover

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.amith.animetracker.data.repository.AnimeRepository
import com.amith.animetracker.data.repository.DiscoverRepository
import com.amith.animetracker.data.repository.ImportProgress
import com.amith.animetracker.domain.ManualStatus
import com.amith.animetracker.domain.ReconcileSeries
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate

sealed interface DiscoverTab {
    data object Search : DiscoverTab
    data object TopRanked : DiscoverTab
    data object ThisSeason : DiscoverTab
}

sealed interface DiscoverUiState {
    data object Idle : DiscoverUiState
    data class Loading(val message: String) : DiscoverUiState
    data class Success(val results: List<ReconcileSeries>) : DiscoverUiState
    data class Error(val message: String) : DiscoverUiState
}

private sealed interface LoadState {
    data object Idle : LoadState
    data class Loading(val message: String) : LoadState
    data class Loaded(val results: List<ReconcileSeries>) : LoadState
    data class Error(val message: String) : LoadState
}

class DiscoverViewModel(
    private val discoverRepository: DiscoverRepository,
    animeRepository: AnimeRepository,
) : ViewModel() {

    private val _selectedTab = MutableStateFlow<DiscoverTab>(DiscoverTab.TopRanked)
    val selectedTab: StateFlow<DiscoverTab> = _selectedTab.asStateFlow()

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _loadState = MutableStateFlow<LoadState>(LoadState.Idle)

    val uiState: StateFlow<DiscoverUiState> =
        combine(_loadState, animeRepository.trackedMalIds) { load, tracked ->
            when (load) {
                LoadState.Idle -> DiscoverUiState.Idle
                is LoadState.Loading -> DiscoverUiState.Loading(load.message)
                is LoadState.Error -> DiscoverUiState.Error(load.message)
                // Exclude the whole grouped series if any of its seasons/movies is already
                // tracked — Discover is for genuinely new series, not partial catch-up.
                is LoadState.Loaded -> DiscoverUiState.Success(
                    load.results.filter { series -> series.entries.none { it.malId in tracked } }
                )
            }
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DiscoverUiState.Loading("Loading..."))

    init {
        selectTab(DiscoverTab.TopRanked)
    }

    fun selectTab(tab: DiscoverTab) {
        _selectedTab.value = tab
        when (tab) {
            DiscoverTab.Search -> _loadState.value = LoadState.Idle
            DiscoverTab.TopRanked -> load(discoverRepository.browseRanking("bypopularity"))
            DiscoverTab.ThisSeason -> {
                val (year, season) = currentYearSeason()
                load(discoverRepository.browseSeason(year, season))
            }
        }
    }

    fun onSearchQueryChange(query: String) {
        _searchQuery.value = query
    }

    fun onSearchSubmit() {
        val query = _searchQuery.value.trim()
        if (query.isEmpty()) return
        load(discoverRepository.search(query))
    }

    fun addSeries(series: ReconcileSeries, manualStatus: ManualStatus) {
        viewModelScope.launch {
            discoverRepository.addSeries(series, manualStatus)
            // trackedMalIds flips once written; the item filters itself out of results.
        }
    }

    private fun load(progressFlow: Flow<ImportProgress>) {
        viewModelScope.launch {
            progressFlow.collect { progress ->
                _loadState.value = when (progress) {
                    ImportProgress.FetchingList -> LoadState.Loading("Fetching results...")
                    is ImportProgress.FetchingDetails ->
                        LoadState.Loading("Fetching details (${progress.completed}/${progress.total})...")
                    is ImportProgress.Ready -> LoadState.Loaded(progress.series)
                    is ImportProgress.Failed -> LoadState.Error(progress.message)
                }
            }
        }
    }

    companion object {
        fun factory(discoverRepository: DiscoverRepository, animeRepository: AnimeRepository) = viewModelFactory {
            initializer { DiscoverViewModel(discoverRepository, animeRepository) }
        }
    }
}

private fun currentYearSeason(): Pair<Int, String> {
    val now = LocalDate.now()
    val season = when (now.monthValue) {
        1, 2, 3 -> "winter"
        4, 5, 6 -> "spring"
        7, 8, 9 -> "summer"
        else -> "fall"
    }
    return now.year to season
}
