// Opens the local SQLite database and wraps it with Drizzle — the RN equivalent of Room's
// `Room.databaseBuilder(...).build()` call in the old AppContainer.kt. Everything else in the
// app (repositories, screens) imports `db` from here rather than touching SQLite directly.
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import * as schema from './schema';

// `enableChangeListener` is what makes useLiveQuery actually reactive — without it, expo-sqlite
// never emits the native change notifications Drizzle's live queries listen for, so writes
// would silently commit to the DB but never trigger a re-render (found by testing tap-to-mark:
// the DB updated correctly, the screen just never refreshed until manually re-fetched).
const expoDb = SQLite.openDatabaseSync('animetracker.db', { enableChangeListener: true });

export const db = drizzle(expoDb, { schema });

// The raw expo-sqlite handle, exported for the one place that needs it directly: the
// useMigrations() hook in the root layout, which requires the underlying connection rather
// than the Drizzle wrapper.
export { expoDb };
