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

    @Query("SELECT COUNT(*) FROM series")
    suspend fun count(): Int

    @Insert
    suspend fun insert(series: SeriesEntity): Long

    @Update
    suspend fun update(series: SeriesEntity)
}
