package com.amith.animetracker.ui.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.amith.animetracker.data.repository.AnimeRepository
import com.amith.animetracker.data.repository.ImportProgress
import com.amith.animetracker.data.repository.ImportRepository
import com.amith.animetracker.data.repository.toEntities
import com.amith.animetracker.domain.ReconcileSeries
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface ReconcileUiState {
    data object FetchingList : ReconcileUiState
    data class FetchingDetails(val completed: Int, val total: Int) : ReconcileUiState
    data class Ready(val series: List<ReconcileSeries>) : ReconcileUiState
    data class Error(val message: String) : ReconcileUiState
    data object Saving : ReconcileUiState
}

class ReconcileViewModel(
    private val importRepository: ImportRepository,
    private val animeRepository: AnimeRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<ReconcileUiState>(ReconcileUiState.FetchingList)
    val uiState: StateFlow<ReconcileUiState> = _uiState.asStateFlow()

    init {
        startImport()
    }

    fun startImport() {
        viewModelScope.launch {
            importRepository.runImport().collect { progress ->
                _uiState.value = when (progress) {
                    ImportProgress.FetchingList -> ReconcileUiState.FetchingList
                    is ImportProgress.FetchingDetails -> ReconcileUiState.FetchingDetails(progress.completed, progress.total)
                    is ImportProgress.Ready -> ReconcileUiState.Ready(progress.series)
                    is ImportProgress.Failed -> ReconcileUiState.Error(progress.message)
                }
            }
        }
    }

    fun toggleEntry(seriesRootMalId: Int, entryMalId: Int) {
        val current = _uiState.value
        if (current !is ReconcileUiState.Ready) return
        val updated = current.series.map { series ->
            if (series.rootMalId != seriesRootMalId) {
                series
            } else {
                series.copy(
                    entries = series.entries.map { entry ->
                        if (entry.malId != entryMalId) entry else entry.copy(watched = !entry.watched)
                    }
                )
            }
        }
        _uiState.value = ReconcileUiState.Ready(updated)
    }

    fun confirmImport() {
        val current = _uiState.value
        if (current !is ReconcileUiState.Ready) return
        viewModelScope.launch {
            _uiState.value = ReconcileUiState.Saving
            animeRepository.replaceAllSeries(current.series.map { it.toEntities() })
            animeRepository.markInitialImportComplete()
            // hasCompletedInitialImport flips true via Room's Flow; AnimeTrackerApp navigates
            // away from this screen on its own once that happens.
        }
    }

    companion object {
        fun factory(importRepository: ImportRepository, animeRepository: AnimeRepository) = viewModelFactory {
            initializer { ReconcileViewModel(importRepository, animeRepository) }
        }
    }
}
