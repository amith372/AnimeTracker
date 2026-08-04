package com.amith.animetracker.data.remote

import com.amith.animetracker.data.remote.dto.TokenResponseDto
import retrofit2.http.Field
import retrofit2.http.FormUrlEncoded
import retrofit2.http.POST

/** Base URL: https://myanimelist.net/v1/oauth2/ */
interface MalAuthApi {
    @FormUrlEncoded
    @POST("token")
    suspend fun exchangeAuthorizationCode(
        @Field("client_id") clientId: String,
        @Field("code") code: String,
        @Field("code_verifier") codeVerifier: String,
        @Field("redirect_uri") redirectUri: String,
        @Field("grant_type") grantType: String = "authorization_code",
    ): TokenResponseDto

    @FormUrlEncoded
    @POST("token")
    suspend fun refreshToken(
        @Field("client_id") clientId: String,
        @Field("refresh_token") refreshToken: String,
        @Field("grant_type") grantType: String = "refresh_token",
    ): TokenResponseDto
}
