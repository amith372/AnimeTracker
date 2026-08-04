package com.amith.animetracker.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.SecureRandom

class PkceTest {

    @Test
    fun `generated code verifier is within MAL's required 43 to 128 char range`() {
        val verifier = generateCodeVerifier(SecureRandom())
        assertTrue(verifier.length in 43..128)
    }

    @Test
    fun `authorize url uses the plain PKCE method with code_challenge equal to the verifier`() {
        val url = buildAuthorizeUrl(
            clientId = "abc123",
            codeVerifier = "verifier-value",
            state = "state-value",
            redirectUri = "animetracker://auth",
        )

        assertTrue(url.startsWith("https://myanimelist.net/v1/oauth2/authorize?"))
        assertTrue(url.contains("code_challenge=verifier-value"))
        assertTrue(url.contains("code_challenge_method=plain"))
        assertTrue(url.contains("client_id=abc123"))
        assertTrue(url.contains("state=state-value"))
        assertTrue(url.contains("redirect_uri=animetracker%3A%2F%2Fauth"))
    }

    @Test
    fun `two generated states are not equal`() {
        val random = SecureRandom()
        assertTrue(generateOAuthState(random) != generateOAuthState(random))
    }
}
