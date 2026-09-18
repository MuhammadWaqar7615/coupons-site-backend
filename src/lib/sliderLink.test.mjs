import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSliderLink } from './sliderLink.js';

test('normalizeSliderLink falls back to # when empty', () => {
  assert.equal(normalizeSliderLink('   '), '#');
  assert.equal(normalizeSliderLink(''), '#');
  assert.equal(normalizeSliderLink(undefined), '#');
});

test('normalizeSliderLink keeps valid URLs', () => {
  assert.equal(normalizeSliderLink('/offerte/plane'), '/offerte/plane');
  assert.equal(normalizeSliderLink('https://example.com'), 'https://example.com');
});
