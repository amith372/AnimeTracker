package com.amith.animetracker.data.local

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import com.amith.animetracker.domain.AiringStatus
import com.amith.animetracker.domain.EntryKind

@Entity(
    tableName = "series_entries",
    foreignKeys = [
        ForeignKey(
            entity = SeriesEntity::class,
            parentColumns = ["id"],
            childColumns = ["seriesId"],
            onDelete = ForeignKey.CASCADE,
        )
    ],
    indices = [Index("seriesId")],
)
data class SeriesEntryEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val seriesId: Long,
    val malId: Int,
    val kind: EntryKind,
    val orderIndex: Int,
    val title: String,
    val episodeCount: Int,
    val watched: Boolean,
    val airingStatus: AiringStatus,
)
