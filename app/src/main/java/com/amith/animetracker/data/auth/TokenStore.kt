package com.amith.animetracker.data.auth

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

data class PendingAuth(val codeVerifier: String, val state: String)

/** Access/refresh tokens and short-lived PKCE state, encrypted at rest via the Keystore. */
class TokenStore(context: Context) {

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "animetracker_auth_prefs",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    val accessToken: String? get() = prefs.getString(KEY_ACCESS_TOKEN, null)
    val refreshToken: String? get() = prefs.getString(KEY_REFRESH_TOKEN, null)
    val isLoggedIn: Boolean get() = accessToken != null

    fun saveTokens(accessToken: String, refreshToken: String, expiresInSeconds: Long) {
        prefs.edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_REFRESH_TOKEN, refreshToken)
            .putLong(KEY_EXPIRY_EPOCH_MILLIS, System.currentTimeMillis() + expiresInSeconds * 1_000)
            .apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    /** Survives the app being backgrounded/killed while the user is in the browser. */
    fun savePendingAuth(codeVerifier: String, state: String) {
        prefs.edit()
            .putString(KEY_PENDING_VERIFIER, codeVerifier)
            .putString(KEY_PENDING_STATE, state)
            .apply()
    }

    fun consumePendingAuth(): PendingAuth? {
        val verifier = prefs.getString(KEY_PENDING_VERIFIER, null)
        val state = prefs.getString(KEY_PENDING_STATE, null)
        prefs.edit().remove(KEY_PENDING_VERIFIER).remove(KEY_PENDING_STATE).apply()
        return if (verifier != null && state != null) PendingAuth(verifier, state) else null
    }

    private companion object {
        const val KEY_ACCESS_TOKEN = "access_token"
        const val KEY_REFRESH_TOKEN = "refresh_token"
        const val KEY_EXPIRY_EPOCH_MILLIS = "access_token_expiry_epoch_millis"
        const val KEY_PENDING_VERIFIER = "pending_code_verifier"
        const val KEY_PENDING_STATE = "pending_state"
    }
}
