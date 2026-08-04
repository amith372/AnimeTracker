package com.amith.animetracker.domain

sealed interface ImportedEntryStatus {
    data object Completed : ImportedEntryStatus
    data class Manual(val status: ManualStatus) : ImportedEntryStatus
}

/**
 * Maps a MAL `list_status.status` value to what it means for a single imported entry.
 * `completed` doesn't map to a [ManualStatus] directly — it means "pre-check this entry as
 * watched, let status derive normally" (WATCHED_FORGOT has no MAL equivalent).
 */
fun mapMalListStatus(malStatus: String): ImportedEntryStatus = when (malStatus) {
    "completed" -> ImportedEntryStatus.Completed
    "watching" -> ImportedEntryStatus.Manual(ManualStatus.CURRENTLY_WATCHING)
    "on_hold" -> ImportedEntryStatus.Manual(ManualStatus.CURRENTLY_WATCHING)
    "dropped" -> ImportedEntryStatus.Manual(ManualStatus.DROPPED)
    "plan_to_watch" -> ImportedEntryStatus.Manual(ManualStatus.PLAN)
    else -> ImportedEntryStatus.Manual(ManualStatus.PLAN)
}

/**
 * Collapses each TV-season entry's imported status into the single series-level manual
 * status. Priority: dropped > currently watching > plan (only if nothing is completed) >
 * NONE (let Watched/Watched X/Y auto-derive from the per-entry watched marks). Dropped wins
 * outright, mirroring CLAUDE.md's rule that a dropped show stays dropped even as new seasons
 * appear.
 */
fun mergeSeriesManualStatus(perSeasonStatuses: List<ImportedEntryStatus>): ManualStatus {
    if (perSeasonStatuses.isEmpty()) return ManualStatus.NONE

    val manualStatuses = perSeasonStatuses.filterIsInstance<ImportedEntryStatus.Manual>().map { it.status }
    if (ManualStatus.DROPPED in manualStatuses) return ManualStatus.DROPPED
    if (ManualStatus.CURRENTLY_WATCHING in manualStatuses) return ManualStatus.CURRENTLY_WATCHING

    val hasCompleted = perSeasonStatuses.any { it is ImportedEntryStatus.Completed }
    if (ManualStatus.PLAN in manualStatuses && !hasCompleted) return ManualStatus.PLAN

    return ManualStatus.NONE
}
