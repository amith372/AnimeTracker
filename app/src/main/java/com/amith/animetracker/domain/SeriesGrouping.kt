package com.amith.animetracker.domain

/**
 * Minimal shape of what `GET /anime/{id}?fields=related_anime,media_type,...` returns.
 * Mirrors the real MAL API response so this logic can be wired to Retrofit DTOs later
 * (Phase 3) without changing the algorithm itself.
 */
data class AnimeRelationDto(
    val id: Int,
    val title: String,
    val mediaType: String,
    val numEpisodes: Int = 0,
    val relatedAnime: List<RelatedAnimeRefDto> = emptyList(),
)

data class RelatedAnimeRefDto(
    val relatedId: Int,
    val relationType: String,
)

data class GroupedEntry(
    val malId: Int,
    val kind: EntryKind,
    val orderIndex: Int,
    val title: String,
    val episodeCount: Int,
)

data class GroupedSeries(
    val title: String,
    val rootMalId: Int,
    val type: SeriesType,
    val entries: List<GroupedEntry>,
)

private val SEQUEL_PREQUEL_TV = setOf("sequel", "prequel")

/**
 * Groups a flat set of MAL anime entries into [GroupedSeries]: TV entries connected by
 * sequel/prequel edges form one series' season chain; movies related to a TV chain (by any
 * relation type) attach to that series; a movie with no TV chain becomes its own
 * STANDALONE_MOVIE series. Chains that overlap (any entry reachable from either side) are
 * merged into a single series rather than duplicated.
 */
fun groupIntoSeries(animeById: Map<Int, AnimeRelationDto>): List<GroupedSeries> {
    val tvIds = animeById.values.filter { it.mediaType == "tv" }.map { it.id }.toSet()

    // Union-find over TV ids connected by sequel/prequel edges.
    val parent = tvIds.associateWith { it }.toMutableMap()
    fun find(x: Int): Int {
        var root = x
        while (parent[root] != root) root = parent.getValue(root)
        var cur = x
        while (parent[cur] != cur) {
            val next = parent.getValue(cur)
            parent[cur] = root
            cur = next
        }
        return root
    }
    fun union(a: Int, b: Int) {
        val ra = find(a)
        val rb = find(b)
        if (ra != rb) parent[ra] = rb
    }

    for (id in tvIds) {
        val anime = animeById.getValue(id)
        for (rel in anime.relatedAnime) {
            if (rel.relationType in SEQUEL_PREQUEL_TV && rel.relatedId in tvIds) {
                union(id, rel.relatedId)
            }
        }
    }

    val tvComponents: Map<Int, MutableList<Int>> = tvIds.groupBy { find(it) }
        .mapValues { it.value.toMutableList() }

    // Map every TV id to its component's root key for quick movie-attachment lookup.
    val tvIdToComponentRoot = mutableMapOf<Int, Int>()
    tvComponents.forEach { (root, members) -> members.forEach { tvIdToComponentRoot[it] = root } }

    val movieIds = animeById.values.filter { it.mediaType == "movie" }.map { it.id }.toSet()
    val moviesByComponentRoot = mutableMapOf<Int, MutableList<Int>>()
    val standaloneMovieIds = mutableListOf<Int>()

    for (movieId in movieIds) {
        val anime = animeById.getValue(movieId)
        val attachedRoot = anime.relatedAnime
            .firstNotNullOfOrNull { rel -> tvIdToComponentRoot[rel.relatedId] }
        if (attachedRoot != null) {
            moviesByComponentRoot.getOrPut(attachedRoot) { mutableListOf() }.add(movieId)
        } else {
            standaloneMovieIds.add(movieId)
        }
    }

    val seriesList = mutableListOf<GroupedSeries>()

    for ((root, members) in tvComponents) {
        val orderedSeasons = orderTvChain(members, animeById)
        val seasonEntries = orderedSeasons.mapIndexed { index, id ->
            val anime = animeById.getValue(id)
            GroupedEntry(
                malId = id,
                kind = EntryKind.TV_SEASON,
                orderIndex = index,
                title = anime.title,
                episodeCount = anime.numEpisodes,
            )
        }
        val movieEntries = (moviesByComponentRoot[root] ?: emptyList())
            .sortedBy { it }
            .mapIndexed { offset, id ->
                val anime = animeById.getValue(id)
                GroupedEntry(
                    malId = id,
                    kind = EntryKind.MOVIE,
                    orderIndex = seasonEntries.size + offset,
                    title = anime.title,
                    episodeCount = anime.numEpisodes,
                )
            }
        val rootMalId = orderedSeasons.first()
        seriesList.add(
            GroupedSeries(
                title = animeById.getValue(rootMalId).title,
                rootMalId = rootMalId,
                type = SeriesType.SERIES,
                entries = seasonEntries + movieEntries,
            )
        )
    }

    for (movieId in standaloneMovieIds) {
        val anime = animeById.getValue(movieId)
        seriesList.add(
            GroupedSeries(
                title = anime.title,
                rootMalId = movieId,
                type = SeriesType.STANDALONE_MOVIE,
                entries = listOf(
                    GroupedEntry(
                        malId = movieId,
                        kind = EntryKind.MOVIE,
                        orderIndex = 0,
                        title = anime.title,
                        episodeCount = anime.numEpisodes,
                    )
                ),
            )
        )
    }

    return seriesList
}

/** Orders a TV component's ids by following prequel edges back to the root (season 1). */
private fun orderTvChain(memberIds: List<Int>, animeById: Map<Int, AnimeRelationDto>): List<Int> {
    val memberSet = memberIds.toSet()
    val prequelOf = mutableMapOf<Int, Int>()
    for (id in memberIds) {
        val anime = animeById.getValue(id)
        for (rel in anime.relatedAnime) {
            if (rel.relationType == "prequel" && rel.relatedId in memberSet) {
                prequelOf[id] = rel.relatedId
            }
        }
    }
    val root = memberIds.first { prequelOf[it] == null }
    val ordered = mutableListOf(root)
    val nextOf = mutableMapOf<Int, Int>()
    for (id in memberIds) {
        val prequel = prequelOf[id]
        if (prequel != null) nextOf[prequel] = id
    }
    var current = root
    while (true) {
        val next = nextOf[current] ?: break
        ordered.add(next)
        current = next
    }
    return ordered
}
