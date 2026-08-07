// Typed wrappers for MAL's list/detail read endpoints — the RN equivalent of the old
// MalDataApi.kt Retrofit interface. DTOs mirror MAL's JSON exactly (snake_case, as it arrives
// over the wire); repositories map these down to domain types explicitly, never using a raw DTO
// past the repository boundary.
import { malGet, malGetUrl, malPut } from './authFetch';

export interface AnimeNodeDto {
  id: number;
  title: string;
}

export interface ListStatusDto {
  status: string;
}

export interface AnimeListEntryDto {
  node: AnimeNodeDto;
  list_status: ListStatusDto;
}

export interface PagingDto {
  next?: string | null;
}

export interface AnimeListResponseDto {
  data: AnimeListEntryDto[];
  paging: PagingDto;
}

export interface GenreDto {
  name: string;
}

export interface MainPictureDto {
  medium?: string;
  large?: string;
}

export interface RelatedAnimeDto {
  node: AnimeNodeDto;
  relation_type: string;
}

export interface StartSeasonDto {
  year: number;
  season: string;
}

/** MAL's `title` is the romaji/original title; the English one (when it exists) lives here. */
export interface AlternativeTitlesDto {
  en?: string;
  ja?: string;
  synonyms?: string[];
}

export interface AnimeDetailDto {
  id: number;
  title: string;
  alternative_titles?: AlternativeTitlesDto;
  media_type: string;
  num_episodes?: number;
  status?: string;
  genres?: GenreDto[];
  main_picture?: MainPictureDto;
  related_anime?: RelatedAnimeDto[];
  start_season?: StartSeasonDto;
  /** MAL's own user-score average (0..10), absent for anime with too few scores to publish one. */
  mean?: number;
  /** Plot summary — only fetched for the not-yet-tracked-show preview screen's info popup. */
  synopsis?: string;
}

export interface AnimeBrowseNodeDto {
  id: number;
  title: string;
  alternative_titles?: AlternativeTitlesDto;
  media_type: string;
  num_episodes?: number;
  status?: string;
  genres?: GenreDto[];
  main_picture?: MainPictureDto;
  start_season?: StartSeasonDto;
}

export interface AnimeBrowseEntryDto {
  node: AnimeBrowseNodeDto;
}

export interface AnimeBrowseResponseDto {
  data: AnimeBrowseEntryDto[];
  paging: PagingDto;
}

/** The user's full MAL list, first page — paginate further via `paging.next` and getAnimeListPage. */
export function getAnimeList(): Promise<AnimeListResponseDto> {
  return malGet('users/@me/animelist', { fields: 'list_status,num_episodes,media_type', limit: 1000 });
}

/** `pageUrl` is the full URL from a previous response's `paging.next`. */
export function getAnimeListPage(pageUrl: string): Promise<AnimeListResponseDto> {
  return malGetUrl(pageUrl);
}

export function getAnimeDetail(id: number): Promise<AnimeDetailDto> {
  return malGet(`anime/${id}`, {
    fields:
      'related_anime,media_type,num_episodes,genres,main_picture,title,alternative_titles,status,start_season,mean,synopsis',
  });
}

const BROWSE_FIELDS = 'media_type,genres,main_picture,num_episodes,start_season,status,alternative_titles';

/** How many results one browse page asks for. Exported so callers can tell a full page (there may
 * be more) from a short one (that was the end) without hardcoding the number twice. */
export const BROWSE_PAGE_SIZE = 25;

export function searchAnime(query: string, offset = 0): Promise<AnimeBrowseResponseDto> {
  return malGet('anime', { q: query, fields: BROWSE_FIELDS, limit: BROWSE_PAGE_SIZE, offset });
}

export function getRanking(rankingType: string, offset = 0): Promise<AnimeBrowseResponseDto> {
  return malGet('anime/ranking', { ranking_type: rankingType, fields: BROWSE_FIELDS, limit: BROWSE_PAGE_SIZE, offset });
}

export function getSeasonal(year: number, season: string, offset = 0): Promise<AnimeBrowseResponseDto> {
  return malGet(`anime/season/${year}/${season}`, { fields: BROWSE_FIELDS, limit: BROWSE_PAGE_SIZE, offset });
}

export interface RecommendationNodeDto {
  node: AnimeNodeDto;
  num_recommendations: number;
}

export interface AnimeRecommendationsDto {
  id: number;
  recommendations?: RecommendationNodeDto[];
}

/** MAL-computed "if you liked this, you might like..." list for one anime — the input to the
 * MAL-based half of Phase 6's recommendation tally. A separate, lighter call from getAnimeDetail
 * since `recommendations` is only ever needed for the user's own watched series, not candidates. */
export function getAnimeRecommendations(id: number): Promise<AnimeRecommendationsDto> {
  return malGet(`anime/${id}`, { fields: 'recommendations' });
}

/** The subset of MAL's own list-status enum this app ever writes — see CLAUDE.md §8 for why only
 * these three (never `on_hold`/`dropped`, which have no unambiguous local equivalent to push). */
export type MalListStatusValue = 'plan_to_watch' | 'watching' | 'completed';

export interface UpdateMyListStatusResponseDto {
  status: string;
}

/** `PUT /anime/{id}/my_list_status` — CLAUDE.md §8's one write path. Sends only `status`; every
 * other field (score, dates, episode count, tags, comments) is left exactly as the user has it on
 * MAL, since an omitted field is untouched rather than reset. */
export function updateMyListStatus(animeId: number, status: MalListStatusValue): Promise<UpdateMyListStatusResponseDto> {
  return malPut(`anime/${animeId}/my_list_status`, { status });
}
