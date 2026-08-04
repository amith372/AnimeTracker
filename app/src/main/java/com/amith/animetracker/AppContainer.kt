package com.amith.animetracker

import android.content.Context
import androidx.room.Room
import com.amith.animetracker.data.auth.AuthInterceptor
import com.amith.animetracker.data.auth.AuthRepository
import com.amith.animetracker.data.auth.TokenStore
import com.amith.animetracker.data.local.AnimeDatabase
import com.amith.animetracker.data.remote.MalAuthApi
import com.amith.animetracker.data.remote.MalDataApi
import com.amith.animetracker.data.repository.AnimeRepository
import com.amith.animetracker.data.repository.DiscoverRepository
import com.amith.animetracker.data.repository.ImportRepository
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

class AppContainer(context: Context) {
    val database: AnimeDatabase by lazy {
        Room.databaseBuilder(context.applicationContext, AnimeDatabase::class.java, "animetracker.db").build()
    }

    val repository: AnimeRepository by lazy { AnimeRepository(database) }

    private val json = Json { ignoreUnknownKeys = true }

    private val loggingInterceptor by lazy {
        HttpLoggingInterceptor().apply {
            // BASIC only (method/url/status) — never log headers/body, which would otherwise
            // leak the Authorization bearer token or refresh token.
            level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
        }
    }

    private val tokenStore: TokenStore by lazy { TokenStore(context.applicationContext) }

    private val authOkHttpClient: OkHttpClient by lazy {
        OkHttpClient.Builder().addInterceptor(loggingInterceptor).build()
    }

    private val malAuthApi: MalAuthApi by lazy {
        Retrofit.Builder()
            .baseUrl("https://myanimelist.net/v1/oauth2/")
            .client(authOkHttpClient)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(MalAuthApi::class.java)
    }

    val authRepository: AuthRepository by lazy { AuthRepository(malAuthApi, tokenStore) }

    private val dataOkHttpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(tokenStore))
            .addInterceptor(loggingInterceptor)
            .build()
    }

    private val malDataApi: MalDataApi by lazy {
        Retrofit.Builder()
            .baseUrl("https://api.myanimelist.net/v2/")
            .client(dataOkHttpClient)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(MalDataApi::class.java)
    }

    val importRepository: ImportRepository by lazy { ImportRepository(malDataApi) }

    val discoverRepository: DiscoverRepository by lazy { DiscoverRepository(malDataApi, repository) }
}
