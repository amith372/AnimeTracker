package com.amith.animetracker.data.repository

import com.amith.animetracker.data.local.SeriesEntryEntity
import com.amith.animetracker.data.remote.MalDataApi
import com.amith.animetracker.data.remote.dto.AnimeDetailDto
import com.amith.animetracker.domain.EntryKind
import com.amith.animetracker.domain.Series
import com.amith.animetracker.domain.SeriesStatus
import com.amith.animetracker.domain.mapAiringStatus
import retrofit2.HttpException
import java.io.IOException

/**
 * Monthly sync: for every series currently derived as Watched or Watched X/Y, walk forward
 * from its last known TV season via `sequel` relation edges to find newly-aired seasons. Only
 * TV_SEASON entries are ever added here — X/Y is TV-season-specific by definition, and new
 * movies/spin-offs stay a Discover/manual-add concern, not an automatic sync one.
 */
class SyncRepository(
    private val malDataApi: MalDataApi,
    private val animeRepository: AnimeRepository,
) {
    /** Returns how many series got at least one new season this run. */
    suspend fun syncAll(): Int {
        val eligible = animeRepository.getAllSeriesOnce().filter {
            it.status is SeriesStatus.Watched || it.status is SeriesStatus.WatchedPartial
        }
        var seriesWithNewSeasons = 0
        for (series in eligible) {
            if (syncSeries(series)) seriesWithNewSeasons++
        }
        return seriesWithNewSeasons
    }

    private suspend fun syncSeries(series: Series): Boolean {
        val knownTvIds = series.entries.filter { it.kind == EntryKind.TV_SEASON }.map { it.malId }.toSet()
        val lastKnownSeason = series.entries
            .filter { it.kind == EntryKind.TV_SEASON }
            .maxByOrNull { it.orderIndex }
            ?: return false

        val discovered = mutableListOf<AnimeDetailDto>()
        var currentDetail = fetchDetailOrNull(lastKnownSeason.malId) ?: return false
        while (true) {
            val sequelId = currentDetail.relatedAnime.firstOrNull { it.relationType == "sequel" }?.node?.id ?: break
            if (sequelId in knownTvIds || discovered.any { it.id == sequelId }) break // cycle guard
            val nextDetail = fetchDetailOrNull(sequelId) ?: break
            if (nextDetail.mediaType != "tv") break
            discovered += nextDetail
            currentDetail = nextDetail
        }

        if (discovered.isEmpty()) return false

        val newEntries = discovered.mapIndexed { index, detail ->
            SeriesEntryEntity(
                seriesId = 0, // overwritten by AnimeRepository
                malId = detail.id,
                kind = EntryKind.TV_SEASON,
                orderIndex = lastKnownSeason.orderIndex + 1 + index,
                title = detail.title,
                episodeCount = detail.numEpisodes,
                watched = false,
                airingStatus = mapAiringStatus(detail.status),
            )
        }
        animeRepository.addNewEntries(series.id, newEntries)
        animeRepository.setNewSeasonAvailable(series.id, true)
        return true
    }

    private suspend fun fetchDetailOrNull(id: Int): AnimeDetailDto? = try {
        malDataApi.getAnimeDetail(id)
    } catch (e: IOException) {
        null
    } catch (e: HttpException) {
        null
    }
}
