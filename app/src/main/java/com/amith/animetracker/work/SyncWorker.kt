package com.amith.animetracker.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.amith.animetracker.data.auth.AuthRepository
import com.amith.animetracker.data.auth.AuthResult
import com.amith.animetracker.data.repository.SyncRepository

/** Monthly periodic worker: refresh the token, then check watched series for new seasons. */
class SyncWorker(
    context: Context,
    params: WorkerParameters,
    private val authRepository: AuthRepository,
    private val syncRepository: SyncRepository,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        if (!authRepository.isLoggedIn.value) return Result.success()

        return when (authRepository.refreshAccessToken()) {
            is AuthResult.Error -> Result.retry()
            AuthResult.Success -> try {
                syncRepository.syncAll()
                Result.success()
            } catch (e: Exception) {
                Result.retry()
            }
        }
    }
}
