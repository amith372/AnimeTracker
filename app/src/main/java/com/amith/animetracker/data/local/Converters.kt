package com.amith.animetracker.data.local

import androidx.room.TypeConverter
import com.amith.animetracker.domain.AiringStatus
import com.amith.animetracker.domain.EntryKind
import com.amith.animetracker.domain.ManualStatus
import com.amith.animetracker.domain.SeriesType

class Converters {
    @TypeConverter
    fun fromGenreList(genres: List<String>): String = genres.joinToString(separator = "|")

    @TypeConverter
    fun toGenreList(raw: String): List<String> = if (raw.isEmpty()) emptyList() else raw.split("|")

    @TypeConverter
    fun fromSeriesType(value: SeriesType): String = value.name

    @TypeConverter
    fun toSeriesType(raw: String): SeriesType = SeriesType.valueOf(raw)

    @TypeConverter
    fun fromManualStatus(value: ManualStatus): String = value.name

    @TypeConverter
    fun toManualStatus(raw: String): ManualStatus = ManualStatus.valueOf(raw)

    @TypeConverter
    fun fromEntryKind(value: EntryKind): String = value.name

    @TypeConverter
    fun toEntryKind(raw: String): EntryKind = EntryKind.valueOf(raw)

    @TypeConverter
    fun fromAiringStatus(value: AiringStatus): String = value.name

    @TypeConverter
    fun toAiringStatus(raw: String): AiringStatus = AiringStatus.valueOf(raw)
}
