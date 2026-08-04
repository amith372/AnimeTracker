package com.amith.animetracker.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class AnimeBrowseResponseDto(
    val data: List<AnimeBrowseEntryDto>,
    val paging: PagingDto = PagingDto(),
)

@Serializable
data class AnimeBrowseEntryDto(
    val node: AnimeBrowseNodeDto,
)

@Serializable
data class AnimeBrowseNodeDto(
    val id: Int,
    val title: String,
    @SerialName("media_type") val mediaType: String,
    @SerialName("num_episodes") val numEpisodes: Int = 0,
    val status: String? = null,
    val genres: List<GenreDto> = emptyList(),
    @SerialName("main_picture") val mainPicture: MainPictureDto? = null,
    @SerialName("start_season") val startSeason: StartSeasonDto? = null,
)

@Serializable
data class StartSeasonDto(
    val year: Int,
    val season: String,
)
