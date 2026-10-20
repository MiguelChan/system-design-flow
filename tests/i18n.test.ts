import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInstance} from 'i18next';
import {es} from '../src/i18n/es.ts';
import {en} from '../src/i18n/en.ts';
import type {TranslationKey} from '../src/i18n/es.ts';
import {translateNotice} from '../src/i18n/notice.ts';

void test('Spanish and English catalogs have matching keys and interpolation contracts', () => {
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  for (const key of Object.keys(es) as TranslationKey[]) {
    const parameters = (value: string): string[] =>
      [...value.matchAll(/{{(.*?)}}/g)].map((match) => match[1]).sort();
    assert.deepEqual(parameters(es[key]), parameters(en[key]), key);
    assert.ok(es[key].trim().length && en[key].trim().length, key);
  }
});
void test('existing simulation events and validation errors translate without resetting the engine', async () => {
  const instance = createInstance();
  await instance.init({
    resources: {es: {translation: es}, en: {translation: en}},
    lng: 'es',
    interpolation: {escapeValue: false},
  });
  const event = {code: 'burstLog', multiplier: 3, seconds: 5} as const;
  assert.match(translateNotice(instance.t, event), /Ráfaga ×3/);
  await instance.changeLanguage('en');
  assert.equal(translateNotice(instance.t, event), 'Burst ×3 for 5 simulated seconds.');
  assert.equal(
    translateNotice(instance.t, {code: 'missingOutput', node: 'My API'}),
    'My API: connect its output.',
  );
});
