package com.amith.animetracker.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class AnimeListResponseDto(
    val data: List<AnimeListEntryDto>,
    val paging: PagingDto = PagingDto(),
)

@Serializable
data class AnimeListEntryDto(
    val node: AnimeNodeDto,
    @SerialName("list_status") val listStatus: ListStatusDto,
)

@Serializable
data class ListStatusDto(
    val status: String,
)

@Serializable
data class PagingDto(
    val next: String? = null,
)

@Serializable
data class AnimeNodeDto(
    val id: Int,
    val title: String,
)
