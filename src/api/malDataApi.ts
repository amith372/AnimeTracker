// Typed wrappers for MAL's read endpoints — Phase 8: these now call Supabase Edge Functions
// (src/api/edgeFunctions.ts) instead of hitting MAL directly (the old authFetch.ts's malGet/malPut
// are gone; MAL token custody lives server-side, see supabase/functions/). Signatures are
// unchanged from the pre-Phase-8 version deliberately, so DiscoverRepository/RecommendationRepository
// needed no changes at all — only the implementation moved. `getAnimeList`/`getAnimeListPage`
// (onboarding import) and `updateMyListStatus` (the push write) are gone from here: mal-import and
// mal-push now do that whole job server-side in one call each — see ImportRepository.ts and
// MalPushRepository.ts.
import { callMalAnimeDetail, callMalDiscover, callMalRecommendations } from './edgeFunctions';

export interface AnimeNodeDto {
  id: number;
  title: string;
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

export interface PagingDto {
  next?: string | null;
}

export interface AnimeBrowseResponseDto {
  data: AnimeBrowseEntryDto[];
  paging: PagingDto;
}

export function getAnimeDetail(id: number): Promise<AnimeDetailDto> {
  return callMalAnimeDetail<AnimeDetailDto>(id);
}

/** How many results one browse page asks for. Exported so callers can tell a full page (there may
 * be more) from a short one (that was the end) without hardcoding the number twice. */
export const BROWSE_PAGE_SIZE = 25;

export function searchAnime(query: string, offset = 0): Promise<AnimeBrowseResponseDto> {
  return callMalDiscover<AnimeBrowseResponseDto>({ type: 'search', query, offset });
}

export function getRanking(rankingType: string, offset = 0): Promise<AnimeBrowseResponseDto> {
  return callMalDiscover<AnimeBrowseResponseDto>({ type: 'ranking', rankingType, offset });
}

export function getSeasonal(year: number, season: string, offset = 0): Promise<AnimeBrowseResponseDto> {
  return callMalDiscover<AnimeBrowseResponseDto>({ type: 'season', year, season, offset });
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
  return callMalRecommendations<AnimeRecommendationsDto>(id);
}
