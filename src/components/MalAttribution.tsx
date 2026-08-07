// Required attribution line — MAL's API License & Developer Agreement (CLAUDE.md guardrail #4)
// obliges us to show "Data from MyAnimeList" in-app. It lives here as a shared component so every
// screen that displays MAL data carries it, rather than only the login screen the user sees once.
import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors } from '@/theme/colors';

export function MalAttribution() {
  return (
    <Text variant="labelSmall" style={styles.text}>
      Data from MyAnimeList
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { textAlign: 'center', color: colors.textMuted, paddingVertical: 6 },
});
