package com.amith.animetracker.domain

enum class SeriesType {
    SERIES,
    STANDALONE_MOVIE,
}

enum class ManualStatus {
    PLAN,
    CURRENTLY_WATCHING,
    DROPPED,
    WATCHED_FORGOT,
    NONE,
}

enum class EntryKind {
    TV_SEASON,
    MOVIE,
}

enum class AiringStatus {
    FINISHED,
    AIRING,
    NOT_YET_AIRED,
}
