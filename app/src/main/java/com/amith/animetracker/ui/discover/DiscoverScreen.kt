package com.amith.animetracker.ui.discover

import androidx.compose.foundation.background
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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.amith.animetracker.domain.EntryKind
import com.amith.animetracker.domain.ManualStatus
import com.amith.animetracker.domain.ReconcileSeries
import com.amith.animetracker.domain.SeriesType
import com.amith.animetracker.ui.common.label

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscoverScreen(
    uiState: DiscoverUiState,
    selectedTab: DiscoverTab,
    searchQuery: String,
    onTabSelected: (DiscoverTab) -> Unit,
    onSearchQueryChange: (String) -> Unit,
    onSearchSubmit: () -> Unit,
    onAdd: (ReconcileSeries, ManualStatus) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var pendingAdd by remember { mutableStateOf<ReconcileSeries?>(null) }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Discover") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { paddingValues ->
        Column(modifier = Modifier.fillMaxSize().padding(paddingValues)) {
            val tabIndex = when (selectedTab) {
                DiscoverTab.TopRanked -> 0
                DiscoverTab.ThisSeason -> 1
                DiscoverTab.Search -> 2
            }
            TabRow(selectedTabIndex = tabIndex) {
                Tab(selected = tabIndex == 0, onClick = { onTabSelected(DiscoverTab.TopRanked) }, text = { Text("Top Ranked") })
                Tab(selected = tabIndex == 1, onClick = { onTabSelected(DiscoverTab.ThisSeason) }, text = { Text("This Season") })
                Tab(selected = tabIndex == 2, onClick = { onTabSelected(DiscoverTab.Search) }, text = { Text("Search") })
            }

            if (selectedTab is DiscoverTab.Search) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = onSearchQueryChange,
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        placeholder = { Text("Search anime") },
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { onSearchSubmit() }),
                    )
                    IconButton(onClick = onSearchSubmit) {
                        Icon(Icons.Filled.Search, contentDescription = "Search")
                    }
                }
            }

            when (uiState) {
                DiscoverUiState.Idle -> CenteredMessage("Search for anime to add")
                is DiscoverUiState.Loading -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator()
                        Text(uiState.message, modifier = Modifier.padding(top = 12.dp))
                    }
                }
                is DiscoverUiState.Error -> CenteredMessage(uiState.message)
                is DiscoverUiState.Success -> {
                    if (uiState.results.isEmpty()) {
                        CenteredMessage("Nothing new here — everything's already in your library")
                    } else {
                        LazyColumn(modifier = Modifier.fillMaxWidth()) {
                            items(uiState.results, key = { it.rootMalId }) { series ->
                                ResultRow(series = series, onAddClick = { pendingAdd = series })
                            }
                        }
                    }
                }
            }
        }
    }

    pendingAdd?.let { series ->
        StatusPickerDialog(
            series = series,
            onDismiss = { pendingAdd = null },
            onConfirm = { status ->
                onAdd(series, status)
                pendingAdd = null
            },
        )
    }
}

@Composable
private fun CenteredMessage(message: String) {
    Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Text(message)
    }
}

@Composable
private fun ResultRow(series: ReconcileSeries, onAddClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AsyncImage(
            model = series.coverUrl,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(width = 56.dp, height = 80.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        )
        Column(modifier = Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(text = series.title, fontWeight = FontWeight.Bold)
            val seasonCount = series.entries.count { it.kind == EntryKind.TV_SEASON }
            val subtitle = listOfNotNull(
                if (series.type == SeriesType.STANDALONE_MOVIE) "Movie" else "TV",
                series.seasonLabel,
                if (seasonCount > 1) "$seasonCount seasons" else null,
            ).joinToString(" · ")
            Text(text = subtitle)
        }
        Button(onClick = onAddClick) { Text("Add") }
    }
}

@Composable
private fun StatusPickerDialog(
    series: ReconcileSeries,
    onDismiss: () -> Unit,
    onConfirm: (ManualStatus) -> Unit,
) {
    var selected by remember { mutableStateOf(ManualStatus.PLAN) }
    val options = listOf(
        ManualStatus.PLAN,
        ManualStatus.CURRENTLY_WATCHING,
        ManualStatus.DROPPED,
        ManualStatus.WATCHED_FORGOT,
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add \"${series.title}\"") },
        text = {
            Column {
                options.forEach { status ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = selected == status, onClick = { selected = status })
                        Text(status.label())
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = { onConfirm(selected) }) { Text("Add") }
        },
        dismissButton = {
            Button(onClick = onDismiss) { Text("Cancel") }
        },
    )
}
