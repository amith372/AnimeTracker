package com.amith.animetracker.data.local

import androidx.room.Embedded
import androidx.room.Relation

data class SeriesWithEntries(
    @Embedded val series: SeriesEntity,
    @Relation(parentColumn = "id", entityColumn = "seriesId")
    val entries: List<SeriesEntryEntity>,
)
