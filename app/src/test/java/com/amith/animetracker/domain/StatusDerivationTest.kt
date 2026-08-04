package com.amith.animetracker.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class StatusDerivationTest {

    private fun entry(orderIndex: Int, watched: Boolean, kind: EntryKind = EntryKind.TV_SEASON) =
        EntryStatusInput(kind = kind, orderIndex = orderIndex, watched = watched)

    @Test
    fun `manual status always wins over derived`() {
        val entries = listOf(entry(0, watched = true), entry(1, watched = true))
        assertEquals(SeriesStatus.Dropped, deriveSeriesStatus(ManualStatus.DROPPED, entries))
    }

    @Test
    fun `all seasons watched is fully Watched`() {
        val entries = listOf(entry(0, watched = true), entry(1, watched = true))
        assertEquals(SeriesStatus.Watched, deriveSeriesStatus(ManualStatus.NONE, entries))
    }

    @Test
    fun `partial consecutive watch reports highest consecutive over total`() {
        val entries = listOf(entry(0, watched = true), entry(1, watched = true), entry(2, watched = false))
        assertEquals(SeriesStatus.WatchedPartial(2, 3), deriveSeriesStatus(ManualStatus.NONE, entries))
    }

    @Test
    fun `a gap stops the consecutive count even if later seasons are watched`() {
        val entries = listOf(entry(0, watched = true), entry(1, watched = false), entry(2, watched = true))
        assertEquals(SeriesStatus.WatchedPartial(1, 3), deriveSeriesStatus(ManualStatus.NONE, entries))
    }

    @Test
    fun `movies never affect the X over Y count`() {
        val entries = listOf(
            entry(0, watched = true, kind = EntryKind.TV_SEASON),
            entry(1, watched = false, kind = EntryKind.MOVIE),
            entry(2, watched = false, kind = EntryKind.TV_SEASON),
        )
        assertEquals(SeriesStatus.WatchedPartial(1, 2), deriveSeriesStatus(ManualStatus.NONE, entries))
    }
}
