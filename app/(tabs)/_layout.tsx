// The 3 primary screens (Library, Discover, For you) as a bottom tab group — added per the
// approved design doc, replacing the old header icon-button nav. series/[id] and onboarding/*
// stay outside this group (see root app/_layout.tsx), so the tab bar hides automatically on them.
//
// Wide web (see useWebLayout.ts) swaps this for the "AnimeTracker Web" design doc's left sidebar
// nav instead — same Tabs/routes underneath, native bottom bar hidden, so it flips back
// automatically on narrow web / native.
//
// The sidebar is positioned absolutely rather than laid out as a plain flexDirection:'row' sibling
// of <Tabs>: React Navigation's bottom-tabs renderer fills its own slot with an internal absolute-
// fill content layer for screen transitions, which ignored a flex-row sibling entirely and rendered
// full-width right through where the sidebar should have been (confirmed live — the sidebar never
// painted at all, leaving wide-web with no navigation whatsoever). Giving the sidebar its own
// absolute layer, and pushing the whole Tabs subtree over with a plain marginLeft, sidesteps
// whatever Tabs does internally instead of fighting it.
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';
import { fontFamilies } from '@/theme/fonts';
import { DiscoverTabIcon, ForYouTabIcon, LibraryTabIcon } from '@/components/TabBarIcon';
import { WebSidebar } from '@/components/web/WebSidebar';
import { useIsWideWeb, WEB_SIDEBAR_WIDTH } from '@/hooks/useWebLayout';

export default function TabsLayout() {
  const isWideWeb = useIsWideWeb();

  return (
    // headerShown:false on every tab screen (see below) means nothing else accounts for the top
    // safe area anymore — without this, the Library/Discover/For you header rows render up under
    // the status bar/clock instead of below it.
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <View style={{ flex: 1 }}>
        {isWideWeb && <WebSidebar />}
        <View style={{ flex: 1, marginLeft: isWideWeb ? WEB_SIDEBAR_WIDTH : 0 }}>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: colors.primary,
              tabBarInactiveTintColor: colors.slate,
              // elevation lifts the bar visibly above the content behind it, so it doesn't visually
              // fuse with the phone's own system nav bar sitting directly below.
              tabBarStyle: isWideWeb
                ? { display: 'none' }
                : { backgroundColor: colors.surface, borderTopColor: colors.border, elevation: 12 },
              tabBarLabelStyle: { fontFamily: fontFamilies.bodySemiBold, fontSize: 11 },
            }}
          >
            <Tabs.Screen name="index" options={{ title: 'Library', tabBarIcon: LibraryTabIcon }} />
            <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: DiscoverTabIcon }} />
            <Tabs.Screen name="recommend" options={{ title: 'For you', tabBarIcon: ForYouTabIcon }} />
          </Tabs>
        </View>
      </View>
    </SafeAreaView>
  );
}
