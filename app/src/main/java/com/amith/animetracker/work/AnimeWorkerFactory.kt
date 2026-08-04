package com.amith.animetracker.work

import android.content.Context
import androidx.work.ListenableWorker
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import com.amith.animetracker.AppContainer

/** Manual DI for WorkManager workers, mirroring [AppContainer]'s service-locator style. */
class AnimeWorkerFactory(private val container: AppContainer) : WorkerFactory() {
    override fun createWorker(
        appContext: Context,
        workerClassName: String,
        workerParameters: WorkerParameters,
    ): ListenableWorker? = when (workerClassName) {
        SyncWorker::class.java.name -> SyncWorker(
            appContext,
            workerParameters,
            container.authRepository,
            container.syncRepository,
        )
        else -> null
    }
}
