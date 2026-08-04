package com.amith.animetracker

import android.app.Application
import androidx.work.Configuration
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.amith.animetracker.work.AnimeWorkerFactory
import com.amith.animetracker.work.SyncWorker
import java.util.concurrent.TimeUnit

class AnimeApp : Application(), Configuration.Provider {
    lateinit var container: AppContainer
        private set

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().setWorkerFactory(AnimeWorkerFactory(container)).build()

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        WorkManager.initialize(this, workManagerConfiguration)
        schedulePeriodicSync()
    }

    private fun schedulePeriodicSync() {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(30, TimeUnit.DAYS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(this)
            .enqueueUniquePeriodicWork(SYNC_WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    companion object {
        const val SYNC_WORK_NAME = "monthly_sync"
    }
}
