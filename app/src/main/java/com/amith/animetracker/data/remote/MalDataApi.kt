package com.amith.animetracker.data.remote

import com.amith.animetracker.data.remote.dto.AnimeBrowseResponseDto
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
        @Query("fields") fields: String = "related_anime,media_type,num_episodes,genres,main_picture,title,status,start_season",
    ): AnimeDetailDto

    @GET("anime")
    suspend fun searchAnime(
        @Query("q") query: String,
        @Query("fields") fields: String = "media_type,genres,main_picture,num_episodes,start_season,status",
        @Query("limit") limit: Int = 25,
    ): AnimeBrowseResponseDto

    @GET("anime/ranking")
    suspend fun getRanking(
        @Query("ranking_type") rankingType: String,
        @Query("fields") fields: String = "media_type,genres,main_picture,num_episodes,start_season,status",
        @Query("limit") limit: Int = 25,
    ): AnimeBrowseResponseDto

    @GET("anime/season/{year}/{season}")
    suspend fun getSeasonal(
        @Path("year") year: Int,
        @Path("season") season: String,
        @Query("fields") fields: String = "media_type,genres,main_picture,num_episodes,start_season,status",
        @Query("limit") limit: Int = 25,
    ): AnimeBrowseResponseDto
}
