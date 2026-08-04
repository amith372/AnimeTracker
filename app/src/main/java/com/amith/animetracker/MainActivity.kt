package com.amith.animetracker

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.lifecycleScope
import com.amith.animetracker.data.FakeSeedData
import com.amith.animetracker.ui.AnimeTrackerApp
import com.amith.animetracker.ui.theme.AnimeTrackerTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val repository = (application as AnimeApp).container.repository
        lifecycleScope.launch { repository.seedIfEmpty(FakeSeedData::seed) }

        setContent {
            AnimeTrackerTheme {
                AnimeTrackerApp(repository = repository)
            }
        }
    }
}
