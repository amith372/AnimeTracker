package com.amith.animetracker.data.auth

import okhttp3.Interceptor
import okhttp3.Response

/** Attaches the current access token to every request. Never log this request/response. */
class AuthInterceptor(private val tokenStore: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val token = tokenStore.accessToken ?: return chain.proceed(request)
        return chain.proceed(
            request.newBuilder().addHeader("Authorization", "Bearer $token").build()
        )
    }
}
