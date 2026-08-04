package com.amith.animetracker.ui.library

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

sealed interface LibraryUiState {
    data object Loading : LibraryUiState
    data class Success(val series: List<Series>) : LibraryUiState
}

class LibraryViewModel(repository: AnimeRepository) : ViewModel() {

    val uiState: StateFlow<LibraryUiState> = repository.allSeries
        .map<List<Series>, LibraryUiState> { LibraryUiState.Success(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), LibraryUiState.Loading)

    companion object {
        fun factory(repository: AnimeRepository) = viewModelFactory {
            initializer { LibraryViewModel(repository) }
        }
    }
}
