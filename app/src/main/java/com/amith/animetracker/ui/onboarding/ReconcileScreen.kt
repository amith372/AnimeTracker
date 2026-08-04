package com.amith.animetracker.ui.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.amith.animetracker.domain.EntryKind
import com.amith.animetracker.domain.ReconcileEntry
import com.amith.animetracker.domain.ReconcileSeries
import com.amith.animetracker.ui.common.label
import com.amith.animetracker.domain.deriveSeriesStatus
import com.amith.animetracker.domain.EntryStatusInput

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReconcileScreen(
    uiState: ReconcileUiState,
    onToggleEntry: (seriesRootMalId: Int, entryMalId: Int) -> Unit,
    onConfirm: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier,
        topBar = { TopAppBar(title = { Text("Import your MyAnimeList") }) },
        bottomBar = {
            if (uiState is ReconcileUiState.Ready) {
                Button(
                    onClick = onConfirm,
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                ) {
                    Text("Confirm & save")
                }
            }
        },
    ) { paddingValues ->
        when (uiState) {
            ReconcileUiState.FetchingList -> StatusContent(
                message = "Fetching your MyAnimeList...",
                modifier = Modifier.fillMaxSize().padding(paddingValues),
            )

            is ReconcileUiState.FetchingDetails -> StatusContent(
                message = "Fetching season/movie details (${uiState.completed}/${uiState.total})...",
                progressFraction = if (uiState.total > 0) uiState.completed.toFloat() / uiState.total else null,
                modifier = Modifier.fillMaxSize().padding(paddingValues),
            )

            ReconcileUiState.Saving -> StatusContent(
                message = "Saving...",
                modifier = Modifier.fillMaxSize().padding(paddingValues),
            )

            is ReconcileUiState.Error -> ErrorContent(
                message = uiState.message,
                onRetry = onRetry,
                modifier = Modifier.fillMaxSize().padding(paddingValues),
            )

            is ReconcileUiState.Ready -> ReconcileList(
                series = uiState.series,
                onToggleEntry = onToggleEntry,
                modifier = Modifier.fillMaxSize().padding(paddingValues),
            )
        }
    }
}

@Composable
private fun StatusContent(message: String, modifier: Modifier = Modifier, progressFraction: Float? = null) {
    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (progressFraction != null) {
                LinearProgressIndicator(progress = { progressFraction })
            } else {
                CircularProgressIndicator()
            }
            Text(message)
        }
    }
}

@Composable
private fun ErrorContent(message: String, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(message, color = MaterialTheme.colorScheme.error)
            Button(onClick = onRetry) { Text("Retry") }
        }
    }
}

@Composable
private fun ReconcileList(
    series: List<ReconcileSeries>,
    onToggleEntry: (seriesRootMalId: Int, entryMalId: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(modifier = modifier) {
        series.forEach { s ->
            item(key = "header-${s.rootMalId}") {
                SeriesHeader(series = s)
            }
            items(s.entries, key = { "entry-${it.malId}" }) { entry ->
                EntryRow(seriesRootMalId = s.rootMalId, entry = entry, onToggleEntry = onToggleEntry)
            }
        }
    }
}

@Composable
private fun SeriesHeader(series: ReconcileSeries) {
    val statusInputs = series.entries.map { EntryStatusInput(it.kind, it.orderIndex, it.watched) }
    val status = deriveSeriesStatus(series.manualStatus, statusInputs)
    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        AsyncImage(
            model = series.coverUrl,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(width = 48.dp, height = 68.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        )
        Column(modifier = Modifier.padding(start = 12.dp)) {
            Text(text = series.title, fontWeight = FontWeight.Bold)
            Text(text = status.label())
        }
    }
}

@Composable
private fun EntryRow(
    seriesRootMalId: Int,
    entry: ReconcileEntry,
    onToggleEntry: (seriesRootMalId: Int, entryMalId: Int) -> Unit,
) {
    ListItem(
        headlineContent = { Text(entry.title) },
        supportingContent = { Text(if (entry.kind == EntryKind.MOVIE) "Movie" else "TV Season") },
        trailingContent = {
            Checkbox(
                checked = entry.watched,
                onCheckedChange = { onToggleEntry(seriesRootMalId, entry.malId) },
            )
        },
        modifier = Modifier.clickable { onToggleEntry(seriesRootMalId, entry.malId) },
    )
}
