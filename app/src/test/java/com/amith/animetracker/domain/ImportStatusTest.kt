package com.amith.animetracker.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class ImportStatusTest {

    @Test
    fun `maps each MAL status to the expected imported status`() {
        assertEquals(ImportedEntryStatus.Completed, mapMalListStatus("completed"))
        assertEquals(ImportedEntryStatus.Manual(ManualStatus.CURRENTLY_WATCHING), mapMalListStatus("watching"))
        assertEquals(ImportedEntryStatus.Manual(ManualStatus.CURRENTLY_WATCHING), mapMalListStatus("on_hold"))
        assertEquals(ImportedEntryStatus.Manual(ManualStatus.DROPPED), mapMalListStatus("dropped"))
        assertEquals(ImportedEntryStatus.Manual(ManualStatus.PLAN), mapMalListStatus("plan_to_watch"))
    }

    @Test
    fun `dropped wins over every other status`() {
        val statuses = listOf(
            ImportedEntryStatus.Completed,
            ImportedEntryStatus.Manual(ManualStatus.CURRENTLY_WATCHING),
            ImportedEntryStatus.Manual(ManualStatus.DROPPED),
        )
        assertEquals(ManualStatus.DROPPED, mergeSeriesManualStatus(statuses))
    }

    @Test
    fun `currently watching wins over plan and completed`() {
        val statuses = listOf(
            ImportedEntryStatus.Completed,
            ImportedEntryStatus.Manual(ManualStatus.PLAN),
            ImportedEntryStatus.Manual(ManualStatus.CURRENTLY_WATCHING),
        )
        assertEquals(ManualStatus.CURRENTLY_WATCHING, mergeSeriesManualStatus(statuses))
    }

    @Test
    fun `all plan_to_watch with nothing completed stays PLAN`() {
        val statuses = listOf(
            ImportedEntryStatus.Manual(ManualStatus.PLAN),
            ImportedEntryStatus.Manual(ManualStatus.PLAN),
        )
        assertEquals(ManualStatus.PLAN, mergeSeriesManualStatus(statuses))
    }

    @Test
    fun `completed plus plan_to_watch falls through to auto-derive as NONE`() {
        val statuses = listOf(
            ImportedEntryStatus.Completed,
            ImportedEntryStatus.Manual(ManualStatus.PLAN),
        )
        assertEquals(ManualStatus.NONE, mergeSeriesManualStatus(statuses))
    }

    @Test
    fun `all completed auto-derives as NONE`() {
        val statuses = listOf(ImportedEntryStatus.Completed, ImportedEntryStatus.Completed)
        assertEquals(ManualStatus.NONE, mergeSeriesManualStatus(statuses))
    }

    @Test
    fun `empty list defaults to NONE`() {
        assertEquals(ManualStatus.NONE, mergeSeriesManualStatus(emptyList()))
    }

    @Test
    fun `maps MAL airing status strings, defaulting unknown values to FINISHED`() {
        assertEquals(AiringStatus.AIRING, mapAiringStatus("currently_airing"))
        assertEquals(AiringStatus.NOT_YET_AIRED, mapAiringStatus("not_yet_aired"))
        assertEquals(AiringStatus.FINISHED, mapAiringStatus("finished_airing"))
        assertEquals(AiringStatus.FINISHED, mapAiringStatus(null))
    }
}
