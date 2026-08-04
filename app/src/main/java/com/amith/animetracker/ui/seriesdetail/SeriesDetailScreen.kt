package com.amith.animetracker.ui.seriesdetail

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.amith.animetracker.domain.EntryKind
import com.amith.animetracker.domain.Series
import com.amith.animetracker.domain.SeriesEntry
import com.amith.animetracker.ui.common.label

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SeriesDetailScreen(
    uiState: SeriesDetailUiState,
    onBack: () -> Unit,
    onToggleWatched: (entryId: Long, currentlyWatched: Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text(if (uiState is SeriesDetailUiState.Success) uiState.series.title else "") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { paddingValues ->
        when (uiState) {
            is SeriesDetailUiState.Loading -> Box(
                modifier = Modifier.fillMaxSize().padding(paddingValues),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }

            is SeriesDetailUiState.NotFound -> Box(
                modifier = Modifier.fillMaxSize().padding(paddingValues),
                contentAlignment = Alignment.Center,
            ) { Text("Series not found") }

            is SeriesDetailUiState.Success -> SeriesDetailContent(
                series = uiState.series,
                onToggleWatched = onToggleWatched,
                modifier = Modifier.fillMaxSize().padding(paddingValues),
            )
        }
    }
}

@Composable
private fun SeriesDetailContent(
    series: Series,
    onToggleWatched: (entryId: Long, currentlyWatched: Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        Text(
            text = series.status.label(),
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            fontWeight = FontWeight.Bold,
        )
        if (series.genres.isNotEmpty()) {
            Text(
                text = series.genres.joinToString(", "),
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }
        LazyColumn(modifier = Modifier.fillMaxWidth()) {
            items(series.entries, key = { it.id }) { entry ->
                EntryRow(entry = entry, onToggleWatched = onToggleWatched)
            }
        }
    }
}

@Composable
private fun EntryRow(entry: SeriesEntry, onToggleWatched: (Long, Boolean) -> Unit) {
    ListItem(
        headlineContent = { Text(entry.title) },
        supportingContent = {
            Text(if (entry.kind == EntryKind.MOVIE) "Movie" else "TV Season")
        },
        trailingContent = {
            Checkbox(
                checked = entry.watched,
                onCheckedChange = { onToggleWatched(entry.id, entry.watched) },
            )
        },
        modifier = Modifier.clickable { onToggleWatched(entry.id, entry.watched) },
    )
}
