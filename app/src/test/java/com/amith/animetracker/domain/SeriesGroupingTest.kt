package com.amith.animetracker.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class SeriesGroupingTest {

    private fun tv(id: Int, title: String, related: List<RelatedAnimeRefDto> = emptyList()) =
        AnimeRelationDto(id = id, title = title, mediaType = "tv", numEpisodes = 12, relatedAnime = related)

    private fun movie(id: Int, title: String, related: List<RelatedAnimeRefDto> = emptyList()) =
        AnimeRelationDto(id = id, title = title, mediaType = "movie", numEpisodes = 1, relatedAnime = related)

    @Test
    fun `straightforward TV sequel chain groups into one series in order`() {
        val season1 = tv(1, "Show S1", related = listOf(RelatedAnimeRefDto(2, "sequel")))
        val season2 = tv(2, "Show S2", related = listOf(RelatedAnimeRefDto(1, "prequel"), RelatedAnimeRefDto(3, "sequel")))
        val season3 = tv(3, "Show S3", related = listOf(RelatedAnimeRefDto(2, "prequel")))
        val byId = listOf(season1, season2, season3).associateBy { it.id }

        val result = groupIntoSeries(byId)

        assertEquals(1, result.size)
        val series = result.single()
        assertEquals(SeriesType.SERIES, series.type)
        assertEquals(1, series.rootMalId)
        assertEquals(listOf(1, 2, 3), series.entries.map { it.malId })
        assertEquals(listOf(0, 1, 2), series.entries.map { it.orderIndex })
        assertEquals(listOf(EntryKind.TV_SEASON, EntryKind.TV_SEASON, EntryKind.TV_SEASON), series.entries.map { it.kind })
    }

    @Test
    fun `movie attaches to its parent TV series`() {
        val season1 = tv(1, "Show S1", related = listOf(RelatedAnimeRefDto(10, "side_story")))
        val film = movie(10, "Show The Movie", related = listOf(RelatedAnimeRefDto(1, "parent_story")))
        val byId = listOf(season1, film).associateBy { it.id }

        val result = groupIntoSeries(byId)

        assertEquals(1, result.size)
        val series = result.single()
        assertEquals(SeriesType.SERIES, series.type)
        assertEquals(2, series.entries.size)
        val movieEntry = series.entries.single { it.kind == EntryKind.MOVIE }
        assertEquals(10, movieEntry.malId)
    }

    @Test
    fun `standalone movie with no TV relations becomes its own series`() {
        val film = movie(50, "Lone Movie")
        val byId = listOf(film).associateBy { it.id }

        val result = groupIntoSeries(byId)

        assertEquals(1, result.size)
        val series = result.single()
        assertEquals(SeriesType.STANDALONE_MOVIE, series.type)
        assertEquals(50, series.rootMalId)
        assertEquals(1, series.entries.size)
    }

    @Test
    fun `overlapping chains referenced from either direction dedupe into one series`() {
        // Season 2 only points back to season 1 (prequel); season 1 does NOT list season 2 as
        // sequel (simulating inconsistent/partial MAL relation data). Season 3 links only to
        // season 2. All three must still merge into a single series via union-find, not three
        // separate ones or a duplicate.
        val season1 = tv(1, "Overlap S1")
        val season2 = tv(2, "Overlap S2", related = listOf(RelatedAnimeRefDto(1, "prequel")))
        val season3 = tv(3, "Overlap S3", related = listOf(RelatedAnimeRefDto(2, "prequel")))
        val byId = listOf(season1, season2, season3).associateBy { it.id }

        val result = groupIntoSeries(byId)

        assertEquals(1, result.size)
        assertEquals(listOf(1, 2, 3), result.single().entries.map { it.malId })
    }

    @Test
    fun `two independent TV chains stay as separate series`() {
        val showA1 = tv(1, "Show A S1", related = listOf(RelatedAnimeRefDto(2, "sequel")))
        val showA2 = tv(2, "Show A S2", related = listOf(RelatedAnimeRefDto(1, "prequel")))
        val showB1 = tv(3, "Show B S1")
        val byId = listOf(showA1, showA2, showB1).associateBy { it.id }

        val result = groupIntoSeries(byId)

        assertEquals(2, result.size)
        assertEquals(setOf(1, 3), result.map { it.rootMalId }.toSet())
    }
}
