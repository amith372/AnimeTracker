package com.amith.animetracker.domain

import java.net.URLEncoder
import java.security.SecureRandom
import java.util.Base64

private const val MAL_AUTHORIZE_URL = "https://myanimelist.net/v1/oauth2/authorize"

/** 32 random bytes base64url-encoded (43 chars) — within MAL's required 43-128 char range. */
fun generateCodeVerifier(random: SecureRandom = SecureRandom()): String {
    val bytes = ByteArray(32)
    random.nextBytes(bytes)
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
}

fun generateOAuthState(random: SecureRandom = SecureRandom()): String {
    val bytes = ByteArray(16)
    random.nextBytes(bytes)
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
}

/**
 * MAL only supports the `plain` PKCE method: code_challenge must equal code_verifier
 * (never SHA256 it), per CLAUDE.md's documented MAL PKCE quirk.
 */
fun buildAuthorizeUrl(
    clientId: String,
    codeVerifier: String,
    state: String,
    redirectUri: String,
): String {
    fun enc(value: String) = URLEncoder.encode(value, "UTF-8")
    return "$MAL_AUTHORIZE_URL" +
        "?response_type=code" +
        "&client_id=${enc(clientId)}" +
        "&code_challenge=${enc(codeVerifier)}" +
        "&code_challenge_method=plain" +
        "&state=${enc(state)}" +
        "&redirect_uri=${enc(redirectUri)}"
}
