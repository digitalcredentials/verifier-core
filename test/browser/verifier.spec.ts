import { test, expect } from '@playwright/test';

// Isomorphic smoke test: confirms the library's main entry loads and runs a
// verification in a real browser (no Node-only APIs leaking into the bundle).
// Uses a network-free path — an unparseable credential resolves to
// `verified: false` via the parsing suite, exercising bundle load + zod parse
// without crypto or HTTP.
test('verifyCredential runs in the browser', async ({ page }) => {
  await page.goto('/test/index.html');
  const result = await page.evaluate(async () => {
    const { verifyCredential } = await import('/src/index.ts');
    return verifyCredential({ credential: 'not-a-credential' });
  });
  expect(result.verified).toBe(false);
});
