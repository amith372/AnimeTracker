package com.amith.animetracker.data.repository

import com.amith.animetracker.data.remote.MalDataApi
import com.amith.animetracker.data.remote.dto.AnimeBrowseNodeDto
import com.amith.animetracker.data.remote.dto.AnimeDetailDto
import com.amith.animetracker.domain.AnimeRelationDto
import com.amith.animetracker.domain.ManualStatus
import com.amith.animetracker.domain.ReconcileEntry
import com.amith.animetracker.domain.ReconcileSeries
import com.amith.animetracker.domain.groupIntoSeries
import com.amith.animetracker.domain.mapAiringStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.FlowCollector
import kotlinx.coroutines.flow.flow
import retrofit2.HttpException
import java.io.IOException

/**
 * Search/browse results are grouped into whole prospective series via the same
 * [groupIntoSeries] algorithm used by import (Phase 3) — a show with multiple seasons in one
 * response shows up as ONE row, not one per season. Season-level detail only ever shows up in
 * a series' own detail "profile" screen after it's tracked. Add creates the whole grouped
 * series (every season/movie in it) in one go, reusing the same entity mapper as reconcile.
 *
 * MAL's list endpoints (`/anime`, `/anime/ranking`, `/anime/season/{year}/{season}`) don't
 * actually return `related_anime` even when requested — only the `/anime/{id}` detail endpoint
 * does. So grouping browse results requires the same two-phase fetch as import: list first,
 * then one detail call per result to get real relation data.
 */
class DiscoverRepository(
    private val malDataApi: MalDataApi,
    private val animeRepository: AnimeRepository,
) {
    fun search(query: String): Flow<ImportProgress> = flow {
        emit(ImportProgress.FetchingList)
        val nodes = try {
            malDataApi.searchAnime(query = query).data.map { it.node }
        } catch (e: IOException) {
            emit(ImportProgress.Failed("Network error while searching: ${e.message}"))
            return@flow
        } catch (e: HttpException) {
            emit(ImportProgress.Failed("MAL rejected the search (HTTP ${e.code()})."))
            return@flow
        }
        emitGrouped(nodes)
    }

    fun browseRanking(rankingType: String): Flow<ImportProgress> = flow {
        emit(ImportProgress.FetchingList)
        val nodes = try {
            malDataApi.getRanking(rankingType = rankingType).data.map { it.node }
        } catch (e: IOException) {
            emit(ImportProgress.Failed("Network error while fetching rankings: ${e.message}"))
            return@flow
        } catch (e: HttpException) {
            emit(ImportProgress.Failed("MAL rejected the request (HTTP ${e.code()})."))
            return@flow
        }
        emitGrouped(nodes)
    }

    fun browseSeason(year: Int, season: String): Flow<ImportProgress> = flow {
        emit(ImportProgress.FetchingList)
        val nodes = try {
            malDataApi.getSeasonal(year = year, season = season).data.map { it.node }
        } catch (e: IOException) {
            emit(ImportProgress.Failed("Network error while fetching this season: ${e.message}"))
            return@flow
        } catch (e: HttpException) {
            emit(ImportProgress.Failed("MAL rejected the request (HTTP ${e.code()})."))
            return@flow
        }
        emitGrouped(nodes)
    }

    suspend fun addSeries(series: ReconcileSeries, manualStatus: ManualStatus) {
        val (seriesEntity, entryEntities) = series.copy(manualStatus = manualStatus).toEntities()
        animeRepository.addSeries(seriesEntity, entryEntities)
    }

    private suspend fun FlowCollector<ImportProgress>.emitGrouped(nodes: List<AnimeBrowseNodeDto>) {
        val detailById = mutableMapOf<Int, AnimeDetailDto>()
        for ((index, node) in nodes.withIndex()) {
            emit(ImportProgress.FetchingDetails(index, nodes.size))
            try {
                detailById[node.id] = malDataApi.getAnimeDetail(node.id)
            } catch (e: IOException) {
                emit(ImportProgress.Failed("Network error while fetching \"${node.title}\": ${e.message}"))
                return
            } catch (e: HttpException) {
                emit(ImportProgress.Failed("MAL rejected the request for \"${node.title}\" (HTTP ${e.code()})."))
                return
            }
        }
        emit(ImportProgress.FetchingDetails(nodes.size, nodes.size))

        val animeById: Map<Int, AnimeRelationDto> = detailById.mapValues { (_, dto) -> dto.toAnimeRelationDto() }
        val grouped = groupIntoSeries(animeById)
        val series = grouped.map { group ->
            val rootDetail = detailById.getValue(group.rootMalId)
            ReconcileSeries(
                title = group.title,
                coverUrl = rootDetail.mainPicture?.medium,
                genres = rootDetail.genres.map { it.name },
                rootMalId = group.rootMalId,
                type = group.type,
                manualStatus = ManualStatus.NONE, // placeholder; overwritten with the user's pick on Add
                entries = group.entries.map { entry ->
                    ReconcileEntry(
                        malId = entry.malId,
                        kind = entry.kind,
                        orderIndex = entry.orderIndex,
                        title = entry.title,
                        episodeCount = entry.episodeCount,
                        airingStatus = mapAiringStatus(detailById[entry.malId]?.status),
                        watched = false,
                    )
                },
                seasonLabel = rootDetail.startSeason?.let { "${it.season.replaceFirstChar(Char::uppercase)} ${it.year}" },
            )
        }
        emit(ImportProgress.Ready(series))
    }
}
