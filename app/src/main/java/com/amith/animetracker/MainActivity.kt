package com.amith.animetracker

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.amith.animetracker.ui.AnimeTrackerApp
import com.amith.animetracker.ui.theme.AnimeTrackerTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val container = (application as AnimeApp).container

        setContent {
            AnimeTrackerTheme {
                AnimeTrackerApp(
                    repository = container.repository,
                    authRepository = container.authRepository,
                    importRepository = container.importRepository,
                    discoverRepository = container.discoverRepository,
                )
            }
        }
    }
}
