package com.amith.animetracker.data.repository

import com.amith.animetracker.data.local.SeriesEntity
import com.amith.animetracker.data.local.SeriesEntryEntity
import com.amith.animetracker.data.remote.MalDataApi
import com.amith.animetracker.data.remote.dto.AnimeDetailDto
import com.amith.animetracker.data.remote.dto.AnimeListEntryDto
import com.amith.animetracker.domain.AnimeRelationDto
import com.amith.animetracker.domain.EntryKind
import com.amith.animetracker.domain.GroupedSeries
import com.amith.animetracker.domain.ImportedEntryStatus
import com.amith.animetracker.domain.ReconcileEntry
import com.amith.animetracker.domain.ReconcileSeries
import com.amith.animetracker.domain.RelatedAnimeRefDto
import com.amith.animetracker.domain.groupIntoSeries
import com.amith.animetracker.domain.mapAiringStatus
import com.amith.animetracker.domain.mapMalListStatus
import com.amith.animetracker.domain.mergeSeriesManualStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import retrofit2.HttpException
import java.io.IOException

sealed interface ImportProgress {
    data object FetchingList : ImportProgress
    data class FetchingDetails(val completed: Int, val total: Int) : ImportProgress
    data class Ready(val series: List<ReconcileSeries>) : ImportProgress
    data class Failed(val message: String) : ImportProgress
}

/**
 * Pulls the user's full MAL list, fetches relation data for each entry, groups it into series
 * via the same [groupIntoSeries] algorithm used since Phase 1, and produces the reconcile
 * checklist. Nothing is written to Room here — that only happens once the user confirms.
 */
class ImportRepository(private val malDataApi: MalDataApi) {

    fun runImport(): Flow<ImportProgress> = flow {
        emit(ImportProgress.FetchingList)
        val listEntries = try {
            fetchFullAnimeList()
        } catch (e: IOException) {
            emit(ImportProgress.Failed("Network error while fetching your list: ${e.message}"))
            return@flow
        } catch (e: HttpException) {
            emit(ImportProgress.Failed("MAL rejected the list request (HTTP ${e.code()})."))
            return@flow
        }

        val statusByMalId: Map<Int, String> = listEntries.associate { it.node.id to it.listStatus.status }

        val detailById = mutableMapOf<Int, AnimeDetailDto>()
        for ((index, entry) in listEntries.withIndex()) {
            emit(ImportProgress.FetchingDetails(index, listEntries.size))
            try {
                detailById[entry.node.id] = malDataApi.getAnimeDetail(entry.node.id)
            } catch (e: IOException) {
                emit(ImportProgress.Failed("Network error while fetching \"${entry.node.title}\": ${e.message}"))
                return@flow
            } catch (e: HttpException) {
                emit(ImportProgress.Failed("MAL rejected the request for \"${entry.node.title}\" (HTTP ${e.code()})."))
                return@flow
            }
        }
        emit(ImportProgress.FetchingDetails(listEntries.size, listEntries.size))

        val animeById: Map<Int, AnimeRelationDto> = detailById.mapValues { (_, dto) -> dto.toAnimeRelationDto() }
        val grouped = groupIntoSeries(animeById)
        val reconcileSeries = grouped.map { it.toReconcileSeries(detailById, statusByMalId) }

        emit(ImportProgress.Ready(reconcileSeries))
    }

    private suspend fun fetchFullAnimeList(): List<AnimeListEntryDto> {
        val all = mutableListOf<AnimeListEntryDto>()
        var response = malDataApi.getAnimeList()
        all += response.data
        var nextUrl = response.paging.next
        while (nextUrl != null) {
            response = malDataApi.getAnimeListPage(nextUrl)
            all += response.data
            nextUrl = response.paging.next
        }
        return all
    }
}

fun AnimeDetailDto.toAnimeRelationDto(): AnimeRelationDto = AnimeRelationDto(
    id = id,
    title = title,
    mediaType = mediaType,
    numEpisodes = numEpisodes,
    relatedAnime = relatedAnime.map { RelatedAnimeRefDto(relatedId = it.node.id, relationType = it.relationType) },
)

private fun GroupedSeries.toReconcileSeries(
    detailById: Map<Int, AnimeDetailDto>,
    statusByMalId: Map<Int, String>,
): ReconcileSeries {
    val rootDetail = detailById.getValue(rootMalId)

    // Only TV seasons participate in the series-level status merge — movies never affect
    // derived status, same as the rest of the status-derivation model.
    val tvSeasonStatuses = entries
        .filter { it.kind == EntryKind.TV_SEASON }
        .mapNotNull { statusByMalId[it.malId] }
        .map { mapMalListStatus(it) }
    val manualStatus = mergeSeriesManualStatus(tvSeasonStatuses)

    val reconcileEntries = entries.map { entry ->
        val imported = statusByMalId[entry.malId]?.let { mapMalListStatus(it) }
        ReconcileEntry(
            malId = entry.malId,
            kind = entry.kind,
            orderIndex = entry.orderIndex,
            title = entry.title,
            episodeCount = entry.episodeCount,
            airingStatus = mapAiringStatus(detailById[entry.malId]?.status),
            watched = imported is ImportedEntryStatus.Completed,
        )
    }

    return ReconcileSeries(
        title = title,
        coverUrl = rootDetail.mainPicture?.medium,
        genres = rootDetail.genres.map { it.name },
        rootMalId = rootMalId,
        type = type,
        manualStatus = manualStatus,
        entries = reconcileEntries,
    )
}

/** Converts a (possibly user-edited) reconcile row into what [AnimeRepository.replaceAllSeries] expects. */
fun ReconcileSeries.toEntities(): Pair<SeriesEntity, List<SeriesEntryEntity>> {
    val seriesEntity = SeriesEntity(
        title = title,
        coverUrl = coverUrl,
        genres = genres,
        rootMalId = rootMalId,
        type = type,
        manualStatus = manualStatus,
    )
    val entryEntities = entries.map { entry ->
        SeriesEntryEntity(
            seriesId = 0, // overwritten by AnimeRepository after insert
            malId = entry.malId,
            kind = entry.kind,
            orderIndex = entry.orderIndex,
            title = entry.title,
            episodeCount = entry.episodeCount,
            watched = entry.watched,
            airingStatus = entry.airingStatus,
        )
    }
    return seriesEntity to entryEntities
}
