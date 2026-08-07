// Redirect target for MAL's OAuth callback (animetracker://auth). expo-router listens for
// incoming links on the app's whole scheme, so this exact same URL also reaches expo-router's own
// navigation handling in parallel with `login()`'s `await WebBrowser.openAuthSessionAsync(...)` —
// without a real route registered at this path, expo-router briefly shows an "Unmatched Route"
// error screen (with the raw auth code visible in the URL) before login() finishes and the gate in
// index.tsx re-renders. Registering this route turns that into an instant, harmless redirect.
import { Redirect } from 'expo-router';

export default function AuthCallbackScreen() {
  return <Redirect href="/" />;
}
