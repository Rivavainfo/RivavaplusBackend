const test = require('node:test');
const assert = require('node:assert/strict');
const { getVerificationEmailHtml, getVerificationEmailText } = require('../src/templates/mailTemplates');
const VerificationService = require('../src/services/verification.service');

test('Verification Templates - render correct Task 5 email subject and body content', () => {
  const email = 'newuser@example.com';
  const verifyLink = 'https://rivava.in/verify?token=abc123xyz';

  const html = getVerificationEmailHtml(email, verifyLink);
  const text = getVerificationEmailText(email, verifyLink);

  // Assert HTML contains required Task 5 brand content
  assert.ok(html.includes("Welcome to Rivava!"), 'HTML should contain Welcome to Rivava!');
  assert.ok(html.includes("India's First Finance Research Hub"), 'HTML should contain subtitle');
  assert.ok(html.includes("Verify Email &amp; Open Rivava"), 'HTML should contain CTA button text');
  assert.ok(html.includes("Once your email is verified, you'll be redirected to the Rivava application"), 'HTML should contain redirection notice');
  assert.ok(html.includes("Welcome aboard!"), 'HTML should contain Welcome aboard!');
  assert.ok(html.includes("Team Rivava"), 'HTML should contain signature');

  // Assert Text contains required Task 5 content
  assert.ok(text.includes("Welcome to Rivava!"), 'Text should contain Welcome to Rivava!');
  assert.ok(text.includes("India's First Finance Research Hub"), 'Text should contain subtitle');
  assert.ok(text.includes(verifyLink), 'Text should contain verification link');
  assert.ok(text.includes("Team Rivava"), 'Text should contain signature');
});

test('VerificationService - rejects missing user ID or email on send', async () => {
  await assert.rejects(
    async () => {
      await VerificationService.sendVerificationEmail(null, 'test@example.com');
    },
    /Missing email or user ID/
  );

  await assert.rejects(
    async () => {
      await VerificationService.sendVerificationEmail('uid123', null);
    },
    /Missing email or user ID/
  );
});

test('VerificationService - rejects missing verification token', async () => {
  await assert.rejects(
    async () => {
      await VerificationService.verifyToken(null);
    },
    /Missing verification token/
  );
});

test('VerificationService - token verification handles invalid token or credential notice', async () => {
  await assert.rejects(
    async () => {
      await VerificationService.verifyToken('invalid_token_999999');
    },
    /Invalid or expired verification token|Could not load the default credentials/
  );
});

test('VerificationService - checkStatus rejects missing user ID', async () => {
  await assert.rejects(
    async () => {
      await VerificationService.checkStatus(null);
    },
    /User ID is required/
  );
});
