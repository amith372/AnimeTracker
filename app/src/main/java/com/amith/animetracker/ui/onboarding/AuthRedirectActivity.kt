package com.amith.animetracker.ui.onboarding

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.amith.animetracker.AnimeApp
import com.amith.animetracker.MainActivity
import kotlinx.coroutines.launch

/** Catches the `animetracker://auth` redirect from the MAL login Custom Tab. */
class AuthRedirectActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val uri = intent?.data
        val code = uri?.getQueryParameter("code")
        val state = uri?.getQueryParameter("state")
        val error = uri?.getQueryParameter("error")
        val authRepository = (application as AnimeApp).container.authRepository

        lifecycleScope.launch {
            if (error == null && code != null && state != null) {
                authRepository.completeLogin(code, state)
            }
            // Regardless of outcome (including AuthResult.Error), return to MainActivity;
            // it reads isLoggedIn fresh and shows Login again on failure.
            startActivity(
                Intent(this@AuthRedirectActivity, MainActivity::class.java)
                    .setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            )
            finish()
        }
    }
}
