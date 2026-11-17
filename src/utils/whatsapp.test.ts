import assert from 'node:assert/strict';
import test from 'node:test';
import { createWhatsAppMessageUrl } from './whatsapp';

test('creates an encoded WhatsApp link and normalizes a Nigerian local number', () => {
  assert.equal(
    createWhatsAppMessageUrl('080 8414 8262', 'Hello there'),
    'https://wa.me/2348084148262?text=Hello%20there'
  );
});

test('preserves an international country code', () => {
  assert.equal(
    createWhatsAppMessageUrl('+234 803 088 0863', 'Please review'),
    'https://wa.me/2348030880863?text=Please%20review'
  );
});

test('returns null when no contact number is available', () => {
  assert.equal(createWhatsAppMessageUrl(undefined, 'Hello'), null);
});
