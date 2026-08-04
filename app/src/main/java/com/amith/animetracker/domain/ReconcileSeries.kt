package com.amith.animetracker.domain

data class ReconcileEntry(
    val malId: Int,
    val kind: EntryKind,
    val orderIndex: Int,
    val title: String,
    val episodeCount: Int,
    val airingStatus: AiringStatus,
    val watched: Boolean,
)

data class ReconcileSeries(
    val title: String,
    val coverUrl: String?,
    val genres: List<String>,
    val rootMalId: Int,
    val type: SeriesType,
    val manualStatus: ManualStatus,
    val entries: List<ReconcileEntry>,
    /** Only populated for Discover results; import/reconcile leaves this null. */
    val seasonLabel: String? = null,
)

fun mapAiringStatus(malStatus: String?): AiringStatus = when (malStatus) {
    "currently_airing" -> AiringStatus.AIRING
    "not_yet_aired" -> AiringStatus.NOT_YET_AIRED
    else -> AiringStatus.FINISHED
}
