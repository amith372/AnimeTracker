package com.amith.animetracker.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.amith.animetracker.domain.ManualStatus
import com.amith.animetracker.domain.SeriesType

@Entity(tableName = "series")
data class SeriesEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val coverUrl: String?,
    val genres: List<String>,
    val rootMalId: Int,
    val type: SeriesType,
    val manualStatus: ManualStatus,
    val newSeasonAvailable: Boolean = false,
)
