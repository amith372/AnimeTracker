package com.amith.animetracker

import android.content.Context
import androidx.room.Room
import com.amith.animetracker.data.local.AnimeDatabase
import com.amith.animetracker.data.repository.AnimeRepository

class AppContainer(context: Context) {
    val database: AnimeDatabase by lazy {
        Room.databaseBuilder(context.applicationContext, AnimeDatabase::class.java, "animetracker.db").build()
    }

    val repository: AnimeRepository by lazy { AnimeRepository(database) }
}
