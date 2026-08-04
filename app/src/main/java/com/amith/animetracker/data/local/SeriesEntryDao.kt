package com.amith.animetracker.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query

@Dao
interface SeriesEntryDao {
    @Insert
    suspend fun insertAll(entries: List<SeriesEntryEntity>)

    @Query("UPDATE series_entries SET watched = :watched WHERE id = :id")
    suspend fun setWatched(id: Long, watched: Boolean)
}
