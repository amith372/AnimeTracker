package com.amith.animetracker.data

import com.amith.animetracker.data.local.SeriesEntity
import com.amith.animetracker.data.local.SeriesEntryEntity
import com.amith.animetracker.domain.AiringStatus
import com.amith.animetracker.domain.AnimeRelationDto
import com.amith.animetracker.domain.EntryKind
import com.amith.animetracker.domain.ManualStatus
import com.amith.animetracker.domain.RelatedAnimeRefDto
import com.amith.animetracker.domain.groupIntoSeries

/**
 * Phase-1-only stand-in for real MAL data: a handful of anime run through the same
 * [groupIntoSeries] algorithm that will later consume real API responses, so the Library
 * screen has something realistic to render before auth/import exist.
 */
object FakeSeedData {

    fun seed(): List<Pair<SeriesEntity, List<SeriesEntryEntity>>> {
        val fixtures = listOf(
            tv(1, "Frontier Blade", related = listOf(RelatedAnimeRefDto(2, "sequel"))),
            tv(2, "Frontier Blade 2nd Season", related = listOf(RelatedAnimeRefDto(1, "prequel"), RelatedAnimeRefDto(3, "sequel"))),
            tv(3, "Frontier Blade 3rd Season", related = listOf(RelatedAnimeRefDto(2, "prequel"), RelatedAnimeRefDto(10, "side_story"))),
            movie(10, "Frontier Blade: The Movie", related = listOf(RelatedAnimeRefDto(3, "parent_story"))),

            tv(20, "Quiet Orbit", related = listOf(RelatedAnimeRefDto(21, "sequel"))),
            tv(21, "Quiet Orbit 2", related = listOf(RelatedAnimeRefDto(20, "prequel"))),

            tv(30, "Paper Skies"),

            movie(40, "A Single Evening"),
        ).associateBy(AnimeRelationDto::id)

        val grouped = groupIntoSeries(fixtures)

        return grouped.map { series ->
            val watchedByMalId: Map<Int, Boolean> = when (series.rootMalId) {
                1 -> mapOf(1 to true, 2 to true, 3 to false, 10 to false) // Watched 2/3
                20 -> mapOf(20 to true, 21 to true) // fully Watched
                40 -> mapOf(40 to false) // standalone movie, unwatched
                else -> emptyMap()
            }
            val manualStatus = when (series.rootMalId) {
                // Not-yet-watched items keep an explicit manual status (as they would coming
                // out of Discover/add in later phases) rather than relying on derivation, since
                // NONE is only meaningful once at least part of the series has been watched.
                30, 40 -> ManualStatus.PLAN
                else -> ManualStatus.NONE
            }
            val entity = SeriesEntity(
                title = series.title,
                coverUrl = null,
                genres = when (series.rootMalId) {
                    1 -> listOf("Action", "Fantasy")
                    20 -> listOf("Sci-Fi", "Drama")
                    30 -> listOf("Slice of Life")
                    else -> listOf("Drama")
                },
                rootMalId = series.rootMalId,
                type = series.type,
                manualStatus = manualStatus,
            )
            val entries = series.entries.map { entry ->
                SeriesEntryEntity(
                    seriesId = 0, // overwritten by the repository after insert
                    malId = entry.malId,
                    kind = entry.kind,
                    orderIndex = entry.orderIndex,
                    title = entry.title,
                    episodeCount = entry.episodeCount,
                    watched = watchedByMalId[entry.malId] ?: false,
                    airingStatus = AiringStatus.FINISHED,
                )
            }
            entity to entries
        }
    }

    private fun tv(id: Int, title: String, related: List<RelatedAnimeRefDto> = emptyList()) =
        AnimeRelationDto(id = id, title = title, mediaType = "tv", numEpisodes = 12, relatedAnime = related)

    private fun movie(id: Int, title: String, related: List<RelatedAnimeRefDto> = emptyList()) =
        AnimeRelationDto(id = id, title = title, mediaType = "movie", numEpisodes = 1, relatedAnime = related)
}
