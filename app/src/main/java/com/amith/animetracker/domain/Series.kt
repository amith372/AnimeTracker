package com.amith.animetracker.domain

data class SeriesEntry(
    val id: Long,
    val malId: Int,
    val kind: EntryKind,
    val orderIndex: Int,
    val title: String,
    val episodeCount: Int,
    val watched: Boolean,
    val airingStatus: AiringStatus,
)

data class Series(
    val id: Long,
    val title: String,
    val coverUrl: String?,
    val genres: List<String>,
    val rootMalId: Int,
    val type: SeriesType,
    val manualStatus: ManualStatus,
    val status: SeriesStatus,
    val entries: List<SeriesEntry>,
    val newSeasonAvailable: Boolean = false,
)
