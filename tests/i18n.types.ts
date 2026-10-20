import type {TFunction} from 'i18next';
import type {Playground} from '../src/playground.ts';
import type {Catalog} from '../src/i18n/es.ts';
import {en} from '../src/i18n/en.ts';

// Typecheck-only contracts. A relaxed typing regression makes these directives fail.
export function checkTypeContracts(t: TFunction, store: Playground): void {
  t('burstLog', {multiplier: '3', seconds: '5'});
  // @ts-expect-error Translation keys must exist in the catalog.
  t('unknown.translation.key');
  // @ts-expect-error Interpolation parameters must match the catalog type.
  t('burstLog', {multiplier: false, seconds: '5'});
  // @ts-expect-error A numeric setting cannot receive text.
  store.updateSetting('worker', 'replicas', 'four');
  // @ts-expect-error Only known algorithms are accepted.
  store.updateSetting('lb', 'algorithm', 'random');
  const {start: _start, ...incomplete} = en;
  void _start;
  // @ts-expect-error Every locale must contain the complete catalog.
  const invalidCatalog: Catalog = incomplete;
  void invalidCatalog;
}
