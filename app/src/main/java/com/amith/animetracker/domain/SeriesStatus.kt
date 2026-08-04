package com.amith.animetracker.domain

sealed class SeriesStatus {
    data object Plan : SeriesStatus()
    data object CurrentlyWatching : SeriesStatus()
    data object Dropped : SeriesStatus()
    data object WatchedForgot : SeriesStatus()
    data object Watched : SeriesStatus()
    data class WatchedPartial(val watchedSeasons: Int, val totalSeasons: Int) : SeriesStatus()
}

data class EntryStatusInput(
    val kind: EntryKind,
    val orderIndex: Int,
    val watched: Boolean,
)

/**
 * Manual status always wins. When manual status is NONE, the status is derived from
 * how many consecutive TV_SEASON entries (ordered by orderIndex) are watched; movies never
 * affect the count.
 */
fun deriveSeriesStatus(manualStatus: ManualStatus, entries: List<EntryStatusInput>): SeriesStatus {
    if (manualStatus != ManualStatus.NONE) {
        return when (manualStatus) {
            ManualStatus.PLAN -> SeriesStatus.Plan
            ManualStatus.CURRENTLY_WATCHING -> SeriesStatus.CurrentlyWatching
            ManualStatus.DROPPED -> SeriesStatus.Dropped
            ManualStatus.WATCHED_FORGOT -> SeriesStatus.WatchedForgot
            ManualStatus.NONE -> throw IllegalStateException("unreachable")
        }
    }

    val seasons = entries.filter { it.kind == EntryKind.TV_SEASON }.sortedBy { it.orderIndex }
    if (seasons.isEmpty() || seasons.all { it.watched }) {
        return SeriesStatus.Watched
    }

    var highestConsecutiveWatched = 0
    for (season in seasons) {
        if (!season.watched) break
        highestConsecutiveWatched++
    }
    return SeriesStatus.WatchedPartial(highestConsecutiveWatched, seasons.size)
}
