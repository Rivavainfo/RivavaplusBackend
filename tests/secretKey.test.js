const test = require('node:test');
const assert = require('node:assert/strict');
const SecretKeyService = require('../src/services/secretKey.service');

test('SecretKeyService - generateRandomKeyString produces secure unique format', () => {
  const key1 = SecretKeyService.generateRandomKeyString('RIV');
  const key2 = SecretKeyService.generateRandomKeyString('RIV');

  // Must match RIV-XXXX-XXXX-XXXX-XXXX pattern
  const pattern = /^RIV-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;

  assert.match(key1, pattern, `Key 1 does not match expected format: ${key1}`);
  assert.match(key2, pattern, `Key 2 does not match expected format: ${key2}`);
  assert.notEqual(key1, key2, 'Two generated keys must not be identical');
});

test('SecretKeyService - normalizeKey cleans user input properly', () => {
  assert.equal(SecretKeyService.normalizeKey('  riv-9k7x-w3p8-2a4m-7q6l  '), 'RIV-9K7X-W3P8-2A4M-7Q6L');
  assert.equal(SecretKeyService.normalizeKey('riv_9k7x_w3p8_2a4m_7q6l'), 'RIV-9K7X-W3P8-2A4M-7Q6L');
  assert.equal(SecretKeyService.normalizeKey(''), '');
});

test('SecretKeyService - validation handles invalid input gracefully', async () => {
  const emptyRes = await SecretKeyService.verifyAndRedeemKey({ keyString: '', userId: 'u1' });
  assert.equal(emptyRes.success, false);
  assert.equal(emptyRes.code, 'EMPTY_KEY');

  const noAuthRes = await SecretKeyService.verifyAndRedeemKey({ keyString: 'RIV-XXXX-YYYY', userId: null });
  assert.equal(noAuthRes.success, false);
  assert.equal(noAuthRes.code, 'UNAUTHORIZED');
});

test('SecretKeyService - generateFormulaKey calculates expected key accurately', () => {
  // Example 1: rohit@gmail.com, 9876543210, October (10) -> ro10987Riva
  const octDate = new Date(2026, 9, 15); // Month is 0-indexed in JS (9 = Oct)
  const res1 = SecretKeyService.generateFormulaKey({
    email: 'rohit@gmail.com',
    phone: '9876543210',
    date: octDate
  });
  assert.equal(res1.success, true);
  assert.equal(res1.expectedKey, 'ro10987Riva');

  // Example 2: aditya@gmail.com, 9123456780, October (10) -> ad10912Riva
  const res2 = SecretKeyService.generateFormulaKey({
    email: 'aditya@gmail.com',
    phone: '9123456780',
    date: octDate
  });
  assert.equal(res2.success, true);
  assert.equal(res2.expectedKey, 'ad10912Riva');

  // +91 Country code normalization test
  const res3 = SecretKeyService.generateFormulaKey({
    email: 'aditya@gmail.com',
    phone: '+919123456780',
    date: octDate
  });
  assert.equal(res3.success, true);
  assert.equal(res3.expectedKey, 'ad10912Riva');
});

test('SecretKeyService - missing or invalid phone number error handling', () => {
  const octDate = new Date(2026, 9, 15);
  const noPhoneRes = SecretKeyService.generateFormulaKey({
    email: 'rohit@gmail.com',
    phone: null,
    date: octDate
  });

  assert.equal(noPhoneRes.success, false);
  assert.equal(noPhoneRes.code, 'MISSING_MOBILE_NUMBER');
  assert.equal(noPhoneRes.message, 'Please add your mobile number to your profile before unlocking Portfolio.');
});

test('SecretKeyService - redeemFormulaSecretKey unlocks portfolio when key matches formula', async () => {
  const octDate = new Date(2026, 9, 15);
  // Mock generateFormulaKey date or pass valid key
  const calc = SecretKeyService.generateFormulaKey({
    email: 'rohit@gmail.com',
    phone: '9876543210'
  });

  const validRes = await SecretKeyService.redeemSecretKey({
    keyString: calc.expectedKey,
    userId: 'test_user_123',
    userEmail: 'rohit@gmail.com',
    userPhone: '9876543210'
  });

  assert.equal(validRes.success, true);
  assert.equal(validRes.code, 'SUCCESS');

  const invalidRes = await SecretKeyService.redeemSecretKey({
    keyString: 'wrongKey123',
    userId: 'test_user_123',
    userEmail: 'rohit@gmail.com',
    userPhone: '9876543210'
  });

  assert.equal(invalidRes.success, false);
  assert.equal(invalidRes.code, 'INVALID_SECRET_KEY');
  assert.equal(invalidRes.message, 'Invalid Secret Key.');
});
