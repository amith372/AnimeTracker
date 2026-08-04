package com.amith.animetracker.data.auth

import com.amith.animetracker.BuildConfig
import com.amith.animetracker.data.remote.MalAuthApi
import com.amith.animetracker.domain.buildAuthorizeUrl
import com.amith.animetracker.domain.generateCodeVerifier
import com.amith.animetracker.domain.generateOAuthState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import retrofit2.HttpException
import java.io.IOException

private const val REDIRECT_URI = "animetracker://auth"

sealed interface AuthResult {
    data object Success : AuthResult
    data class Error(val message: String) : AuthResult
}

class AuthRepository(
    private val api: MalAuthApi,
    private val tokenStore: TokenStore,
) {
    private val _isLoggedIn = MutableStateFlow(tokenStore.isLoggedIn)
    val isLoggedIn: StateFlow<Boolean> = _isLoggedIn.asStateFlow()

    /** Starts a login attempt and returns the URL to open in a Custom Tab. */
    fun startLogin(): String {
        val codeVerifier = generateCodeVerifier()
        val state = generateOAuthState()
        tokenStore.savePendingAuth(codeVerifier, state)
        return buildAuthorizeUrl(
            clientId = BuildConfig.MAL_CLIENT_ID,
            codeVerifier = codeVerifier,
            state = state,
            redirectUri = REDIRECT_URI,
        )
    }

    suspend fun completeLogin(code: String, returnedState: String): AuthResult {
        val pending = tokenStore.consumePendingAuth()
            ?: return AuthResult.Error("No login was in progress.")
        if (pending.state != returnedState) {
            return AuthResult.Error("Login state did not match; possible tampering.")
        }
        return try {
            val response = api.exchangeAuthorizationCode(
                clientId = BuildConfig.MAL_CLIENT_ID,
                code = code,
                codeVerifier = pending.codeVerifier,
                redirectUri = REDIRECT_URI,
            )
            tokenStore.saveTokens(response.accessToken, response.refreshToken, response.expiresIn)
            _isLoggedIn.value = true
            AuthResult.Success
        } catch (e: IOException) {
            AuthResult.Error("Network error while logging in: ${e.message}")
        } catch (e: HttpException) {
            AuthResult.Error("MAL rejected the login (HTTP ${e.code()}).")
        }
    }

    suspend fun refreshAccessToken(): AuthResult {
        val refreshToken = tokenStore.refreshToken
            ?: return AuthResult.Error("Not logged in.")
        return try {
            val response = api.refreshToken(clientId = BuildConfig.MAL_CLIENT_ID, refreshToken = refreshToken)
            tokenStore.saveTokens(response.accessToken, response.refreshToken, response.expiresIn)
            AuthResult.Success
        } catch (e: IOException) {
            AuthResult.Error("Network error while refreshing token: ${e.message}")
        } catch (e: HttpException) {
            AuthResult.Error("MAL rejected the refresh (HTTP ${e.code()}).")
        }
    }

    fun logout() {
        tokenStore.clear()
        _isLoggedIn.value = false
    }
}
