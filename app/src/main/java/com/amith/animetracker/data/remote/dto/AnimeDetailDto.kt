package com.amith.animetracker.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class AnimeDetailDto(
    val id: Int,
    val title: String,
    @SerialName("media_type") val mediaType: String,
    @SerialName("num_episodes") val numEpisodes: Int = 0,
    val status: String? = null,
    val genres: List<GenreDto> = emptyList(),
    @SerialName("main_picture") val mainPicture: MainPictureDto? = null,
    @SerialName("related_anime") val relatedAnime: List<RelatedAnimeDto> = emptyList(),
)

@Serializable
data class GenreDto(val name: String)

@Serializable
data class MainPictureDto(
    val medium: String? = null,
    val large: String? = null,
)

@Serializable
data class RelatedAnimeDto(
    val node: AnimeNodeDto,
    @SerialName("relation_type") val relationType: String,
)
