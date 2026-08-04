package com.amith.animetracker.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters

@Database(
    entities = [SeriesEntity::class, SeriesEntryEntity::class, SyncMetaEntity::class],
    version = 1,
    exportSchema = false,
)
@TypeConverters(Converters::class)
abstract class AnimeDatabase : RoomDatabase() {
    abstract fun seriesDao(): SeriesDao
    abstract fun seriesEntryDao(): SeriesEntryDao
    abstract fun syncMetaDao(): SyncMetaDao
}
