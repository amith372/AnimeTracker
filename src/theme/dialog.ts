// Shared width cap for every Paper Dialog in the app.
//
// Paper's Dialog stretches to fill its container, and its container is the whole window — so on
// desktop web a four-row status picker rendered ~1900px wide with a sea of empty space to the
// right of the text. Paper only narrows it on what it considers a tablet breakpoint, which the
// browser doesn't hit. Capping the width here (and centring what's left) keeps a popup a readable
// column on a wide window while still filling a phone screen sensibly.
//
// marginHorizontal is deliberately zeroed: Paper's own Dialog style sets 26 on each side, and a
// percentage width is measured against the full container, so leaving both would push a phone-width
// dialog 52px past the screen edge. The 90% below is the gutter instead.
import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  dialog: { alignSelf: 'center', width: '90%', maxWidth: 420, marginHorizontal: 0 },
});

export const dialogStyle = styles.dialog;
