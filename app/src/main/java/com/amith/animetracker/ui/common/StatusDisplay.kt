package com.amith.animetracker.ui.common

import com.amith.animetracker.domain.SeriesStatus

fun SeriesStatus.label(): String = when (this) {
    SeriesStatus.Plan -> "Plan to watch"
    SeriesStatus.CurrentlyWatching -> "Watching"
    SeriesStatus.Dropped -> "Dropped"
    SeriesStatus.WatchedForgot -> "Watched (forgot details)"
    SeriesStatus.Watched -> "Watched"
    is SeriesStatus.WatchedPartial -> "Watched $watchedSeasons/$totalSeasons"
}
