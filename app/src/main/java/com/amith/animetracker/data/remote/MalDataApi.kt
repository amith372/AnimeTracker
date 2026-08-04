package com.amith.animetracker.data.remote

import com.amith.animetracker.data.remote.dto.AnimeDetailDto
import com.amith.animetracker.data.remote.dto.AnimeListResponseDto
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Url

/** Base URL: https://api.myanimelist.net/v2/ — all calls require an Authorization: Bearer header. */
interface MalDataApi {
    @GET("users/@me/animelist")
    suspend fun getAnimeList(
        @Query("fields") fields: String = "list_status,num_episodes,media_type",
        @Query("limit") limit: Int = 1000,
    ): AnimeListResponseDto

    /** [pageUrl] is the full URL from a previous response's `paging.next`. */
    @GET
    suspend fun getAnimeListPage(@Url pageUrl: String): AnimeListResponseDto

    @GET("anime/{id}")
    suspend fun getAnimeDetail(
        @Path("id") id: Int,
        @Query("fields") fields: String = "related_anime,media_type,num_episodes,genres,main_picture,title,status",
    ): AnimeDetailDto
}
