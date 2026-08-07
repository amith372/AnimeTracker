// Root layout — every screen renders inside this. Its job: run pending DB migrations, then hand
// off to Expo Router's file-based navigation stack once the DB is ready. Real data now flows in
// via login + import (see app/index.tsx's auth/import gate), so there's no fake-data seeding step
// here anymore — that was Phase 1-only scaffolding, superseded once Phase 3 landed.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { PaperProvider, Text } from 'react-native-paper';
import { db } from '@/db/client';
import migrations from '@/db/migrations/migrations';
import { registerBackgroundSync } from '@/repositories/SyncRepository';
import { pruneExpiredApiCache } from '@/repositories/apiCache';
import { startSyncEngine } from '@/sync/outbox';
import { paperTheme } from '@/theme/theme';
import { fontsToLoad } from '@/theme/fonts';

// Paper renders its icons (checkboxes, chips, etc.) through this callback rather than
// auto-detecting a font — Expo apps use @expo/vector-icons since its fonts are already bundled
// by Expo, unlike react-native-vector-icons which needs manual native font linking.
function PaperIcon({ name, size, color }: { name: string; size: number; color?: string }) {
  return <MaterialCommunityIcons name={name as never} size={size} color={color ?? '#000000'} />;
}

export default function RootLayout() {
  const { success: migrationsDone, error: migrationError } = useMigrations(db, migrations);
  // fontError deliberately doesn't block rendering below — falling back to the system font beats
  // never showing the app at all if a font fails to load.
  const [fontsLoaded, fontError] = useFonts(fontsToLoad);

  // Registration is idempotent (see registerBackgroundSync) and cheap, so it's safe to just call
  // on every launch rather than tracking "have we already registered" state ourselves.
  useEffect(() => {
    registerBackgroundSync();
    startSyncEngine();
  }, []);

  // Expired cache rows are dead weight; clearing them once per launch (after migrations create
  // the table) keeps the table from growing without bound.
  useEffect(() => {
    if (!migrationsDone) return;
    pruneExpiredApiCache();
  }, [migrationsDone]);

  if (migrationError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text variant="bodyLarge">Database setup failed: {migrationError.message}</Text>
      </View>
    );
  }

  if (!migrationsDone || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
        <PaperProvider theme={paperTheme} settings={{ icon: PaperIcon }}>
          <StatusBar style="dark" />
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
  );
}
