package com.amith.animetracker.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface SeriesEntryDao {
    @Insert
    suspend fun insertAll(entries: List<SeriesEntryEntity>)

    @Query("UPDATE series_entries SET watched = :watched WHERE id = :id")
    suspend fun setWatched(id: Long, watched: Boolean)

    @Query("SELECT malId FROM series_entries")
    fun observeAllMalIds(): Flow<List<Int>>
}
