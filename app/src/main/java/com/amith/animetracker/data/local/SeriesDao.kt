package com.amith.animetracker.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface SeriesDao {
    @Transaction
    @Query("SELECT * FROM series ORDER BY title")
    fun observeAllWithEntries(): Flow<List<SeriesWithEntries>>

    @Transaction
    @Query("SELECT * FROM series WHERE id = :id")
    fun observeByIdWithEntries(id: Long): Flow<SeriesWithEntries?>

    @Transaction
    @Query("SELECT * FROM series ORDER BY title")
    suspend fun getAllWithEntriesOnce(): List<SeriesWithEntries>

    @Insert
    suspend fun insert(series: SeriesEntity): Long

    @Update
    suspend fun update(series: SeriesEntity)

    @Query("UPDATE series SET newSeasonAvailable = :available WHERE id = :seriesId")
    suspend fun setNewSeasonAvailable(seriesId: Long, available: Boolean)

    @Query("DELETE FROM series")
    suspend fun deleteAll()
}
