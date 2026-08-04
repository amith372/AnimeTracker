package com.amith.animetracker.data.repository

import com.amith.animetracker.data.local.AnimeDatabase
import com.amith.animetracker.data.local.SeriesEntity
import com.amith.animetracker.data.local.SeriesEntryEntity
import com.amith.animetracker.data.local.SeriesWithEntries
import com.amith.animetracker.domain.EntryStatusInput
import com.amith.animetracker.domain.Series
import com.amith.animetracker.domain.SeriesEntry
import com.amith.animetracker.domain.deriveSeriesStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class AnimeRepository(private val db: AnimeDatabase) {

    val allSeries: Flow<List<Series>> =
        db.seriesDao().observeAllWithEntries().map { list -> list.map { it.toDomain() } }

    fun observeSeries(seriesId: Long): Flow<Series?> =
        db.seriesDao().observeByIdWithEntries(seriesId).map { it?.toDomain() }

    suspend fun setEntryWatched(entryId: Long, watched: Boolean) {
        db.seriesEntryDao().setWatched(entryId, watched)
    }

    suspend fun seedIfEmpty(seed: () -> List<Pair<SeriesEntity, List<SeriesEntryEntity>>>) {
        if (db.seriesDao().count() > 0) return
        for ((series, entries) in seed()) {
            val seriesId = db.seriesDao().insert(series)
            db.seriesEntryDao().insertAll(entries.map { it.copy(seriesId = seriesId) })
        }
    }
}

private fun SeriesWithEntries.toDomain(): Series {
    val statusInputs = entries.map { EntryStatusInput(it.kind, it.orderIndex, it.watched) }
    val status = deriveSeriesStatus(series.manualStatus, statusInputs)
    return Series(
        id = series.id,
        title = series.title,
        coverUrl = series.coverUrl,
        genres = series.genres,
        rootMalId = series.rootMalId,
        type = series.type,
        manualStatus = series.manualStatus,
        status = status,
        entries = entries.sortedBy { it.orderIndex }.map {
            SeriesEntry(
                id = it.id,
                malId = it.malId,
                kind = it.kind,
                orderIndex = it.orderIndex,
                title = it.title,
                episodeCount = it.episodeCount,
                watched = it.watched,
                airingStatus = it.airingStatus,
            )
        },
    )
}
