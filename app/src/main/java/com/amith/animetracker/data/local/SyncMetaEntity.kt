package com.amith.animetracker.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/** Single-row table (fixed id 0) holding the last successful monthly sync time. */
@Entity(tableName = "sync_meta")
data class SyncMetaEntity(
    @PrimaryKey val id: Int = 0,
    val lastSyncEpoch: Long,
)
