// Required attribution line — MAL's API License & Developer Agreement (CLAUDE.md guardrail #4)
// obliges us to show "Data from MyAnimeList" in-app. It lives here as a shared component so every
// screen that displays MAL data carries it, rather than only the login screen the user sees once.
import { Text } from 'react-native-paper';
import { makeStyles } from '@/theme/useTheme';

export function MalAttribution() {
  const styles = useStyles();
  return (
    <Text variant="labelSmall" style={styles.text}>
      Data from MyAnimeList
    </Text>
  );
}

const useStyles = makeStyles((colors) => ({
  text: { textAlign: 'center', color: colors.textMuted, paddingVertical: 6 },
}));
