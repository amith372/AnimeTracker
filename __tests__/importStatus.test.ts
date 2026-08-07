import { mapMalListStatus, mergeSeriesManualStatus, type ImportedEntryStatus } from '@/domain/importStatus';
import { mapAiringStatus } from '@/domain/reconcileSeries';
import type { ManualStatus } from '@/domain/types';

const COMPLETED: ImportedEntryStatus = { kind: 'COMPLETED' };
const manual = (status: ManualStatus): ImportedEntryStatus => ({ kind: 'MANUAL', status });

test('maps each MAL status to the expected imported status', () => {
  expect(mapMalListStatus('completed')).toEqual(COMPLETED);
  expect(mapMalListStatus('watching')).toEqual(manual('CURRENTLY_WATCHING'));
  expect(mapMalListStatus('on_hold')).toEqual(manual('CURRENTLY_WATCHING'));
  expect(mapMalListStatus('dropped')).toEqual(manual('DROPPED'));
  expect(mapMalListStatus('plan_to_watch')).toEqual(manual('PLAN'));
});

test('dropped wins over every other status', () => {
  const statuses = [COMPLETED, manual('CURRENTLY_WATCHING'), manual('DROPPED')];
  expect(mergeSeriesManualStatus(statuses)).toBe('DROPPED');
});

test('currently watching wins over plan and completed', () => {
  const statuses = [COMPLETED, manual('PLAN'), manual('CURRENTLY_WATCHING')];
  expect(mergeSeriesManualStatus(statuses)).toBe('CURRENTLY_WATCHING');
});

test('all plan_to_watch with nothing completed stays PLAN', () => {
  const statuses = [manual('PLAN'), manual('PLAN')];
  expect(mergeSeriesManualStatus(statuses)).toBe('PLAN');
});

test('completed plus plan_to_watch falls through to auto-derive as NONE', () => {
  const statuses = [COMPLETED, manual('PLAN')];
  expect(mergeSeriesManualStatus(statuses)).toBe('NONE');
});

test('all completed auto-derives as NONE', () => {
  expect(mergeSeriesManualStatus([COMPLETED, COMPLETED])).toBe('NONE');
});

test('empty list defaults to NONE', () => {
  expect(mergeSeriesManualStatus([])).toBe('NONE');
});

test('maps MAL airing status strings, defaulting unknown values to FINISHED', () => {
  expect(mapAiringStatus('currently_airing')).toBe('AIRING');
  expect(mapAiringStatus('not_yet_aired')).toBe('NOT_YET_AIRED');
  expect(mapAiringStatus('finished_airing')).toBe('FINISHED');
  expect(mapAiringStatus(null)).toBe('FINISHED');
});
