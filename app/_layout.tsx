// Root layout — every screen renders inside this. Real data flows in via login + import (see
// app/(tabs)/index.tsx's auth/import gate); there's no local database to migrate or seed anymore
// (direct-Postgres cutover — see CLAUDE.md's "What this is") so the only real boot gate left is
// fonts.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { PaperProvider, Text } from 'react-native-paper';
import { isSupabaseConfigured } from '@/account/supabaseClient';
import { queryClient } from '@/repositories/queryClient';
import { startLibraryRealtime } from '@/repositories/realtime';
import { usePaperTheme } from '@/theme/theme';
import { fontsToLoad } from '@/theme/fonts';

// Paper renders its icons (checkboxes, chips, etc.) through this callback rather than
// auto-detecting a font — Expo apps use @expo/vector-icons since its fonts are already bundled
// by Expo, unlike react-native-vector-icons which needs manual native font linking.
function PaperIcon({ name, size, color }: { name: string; size: number; color?: string }) {
  return <MaterialCommunityIcons name={name as never} size={size} color={color ?? '#000000'} />;
}

export default function RootLayout() {
  // fontError deliberately doesn't block rendering below — falling back to the system font beats
  // never showing the app at all if a font fails to load.
  const [fontsLoaded, fontError] = useFonts(fontsToLoad);
  const theme = usePaperTheme();

  // Realtime -> query-invalidation wiring (src/repositories/realtime.ts) replaces the old
  // Phase 9/10 outbox/pull sync engine entirely — there's no local mirror to reconcile anymore,
  // just the cache TanStack Query already holds. Not gated on anything: it subscribes/resubscribes
  // itself as the auth session changes.
  useEffect(() => startLibraryRealtime(), []);

  // A blank .env used to still leave the app fully working (everything was local SQLite). Now it's
  // completely non-functional — every read/write goes straight to Postgres — so a misconfigured
  // clone should fail loudly here rather than silently render an empty library forever.
  if (!isSupabaseConfigured) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text variant="bodyLarge" style={{ textAlign: 'center' }}>
          Backend not configured — see CLAUDE.md's Setup/secrets section for EXPO_PUBLIC_SUPABASE_URL
          / EXPO_PUBLIC_SUPABASE_ANON_KEY.
        </Text>
      </View>
    );
  }

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
          <PaperProvider theme={theme} settings={{ icon: PaperIcon }}>
            {/* "auto" rather than a hardcoded "dark": the bar's icons have to invert with the
                appearance, or they vanish into whichever background they're sitting on. */}
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerTitleAlign: 'center' }}>
              {/* The bottom-tab group (Library/Discover/For you) is its own nested navigator with
                  its own header handling — headerShown false here so it doesn't get a second,
                  redundant native header on top of the tab bar. */}
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              {/* headerShown:false — the screen draws its own gradient banner with a back button,
                  see app/series/[id].tsx. */}
              <Stack.Screen name="series/[id]" options={{ headerShown: false }} />
              {/* Same reasoning as series/[id] — see app/series/preview.tsx. */}
              <Stack.Screen name="series/preview" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding/login" options={{ title: 'Log in', headerShown: false }} />
              <Stack.Screen name="onboarding/account" options={{ title: 'Account' }} />
              <Stack.Screen name="auth" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding/reconcile" options={{ title: 'Import your MyAnimeList' }} />
            </Stack>
          </PaperProvider>
        </SafeAreaView>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
