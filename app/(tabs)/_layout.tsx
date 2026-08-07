// The 3 primary screens (Library, Discover, For you) as a bottom tab group — added per the
// approved design doc, replacing the old header icon-button nav. series/[id] and onboarding/*
// stay outside this group (see root app/_layout.tsx), so the tab bar hides automatically on them.
import { Tabs } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';
import { fontFamilies } from '@/theme/fonts';
import { DiscoverTabIcon, ForYouTabIcon, LibraryTabIcon } from '@/components/TabBarIcon';

export default function TabsLayout() {
  return (
    // headerShown:false on every tab screen (see below) means nothing else accounts for the top
    // safe area anymore — without this, the Library/Discover/For you header rows render up under
    // the status bar/clock instead of below it.
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.slate,
          // elevation lifts the bar visibly above the content behind it, so it doesn't visually
          // fuse with the phone's own system nav bar sitting directly below.
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, elevation: 12 },
          tabBarLabelStyle: { fontFamily: fontFamilies.bodySemiBold, fontSize: 11 },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Library', tabBarIcon: LibraryTabIcon }} />
        <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: DiscoverTabIcon }} />
        <Tabs.Screen name="recommend" options={{ title: 'For you', tabBarIcon: ForYouTabIcon }} />
      </Tabs>
    </SafeAreaView>
  );
}
