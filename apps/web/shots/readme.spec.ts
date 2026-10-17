import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../../docs/images/', import.meta.url));

async function open(page: Page, lang = 'en', theme = 'dark') {
  await page.addInitScript(
    ([l, th]) => {
      localStorage.setItem('fresnel.lang', l!);
      localStorage.setItem('fresnel.theme', th!);
    },
    [lang, theme],
  );
  await page.goto('/');
  await expect(page.getByAltText('iOS default preview')).toBeVisible();
}
const settle = (page: Page) => page.waitForTimeout(700);

test('editor', async ({ page }) => {
  await open(page);
  await page.getByRole('treeitem', { name: /Waves/ }).click();
  await settle(page);
  await page.screenshot({ path: join(OUT, 'editor.png') });
});

test('dark variant', async ({ page }) => {
  await open(page);
  await page.getByRole('treeitem', { name: /Waves/ }).click();
  await page.getByRole('radio', { name: 'Dark', exact: true }).click();
  await page.getByRole('combobox', { name: 'Liquid Glass: Applies to' }).selectOption('variant');
  await settle(page);
  await page.screenshot({ path: join(OUT, 'dark.png') });
});

test('mono', async ({ page }) => {
  await open(page);
  await page.getByRole('radio', { name: 'Mono', exact: true }).click();
  await page.getByRole('button', { name: 'Mono options' }).click();
  await page.getByRole('switch', { name: 'Tinted' }).click();
  await settle(page);
  await page.screenshot({ path: join(OUT, 'mono.png') });
});

test('compare', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /Compare/ }).click();
  await settle(page);
  await page.screenshot({ path: join(OUT, 'compare.png') });
});

test('export', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Export…' }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, 'export.png') });
});

test('vary for', async ({ page }) => {
  await open(page);
  await page.getByRole('treeitem', { name: /Sun/ }).nth(1).click();
  await page.getByRole('radio', { name: 'watchOS', exact: true }).click();
  await page.getByRole('button', { name: 'Opacity: Add a variant' }).click({ force: true });
  await settle(page);
  await page.screenshot({ path: join(OUT, 'vary-for.png'), clip: { x: 1440 - 340, y: 40, width: 340, height: 620 } });
});

test('japanese light', async ({ page }) => {
  await open(page, 'ja', 'light');
  await page.getByRole('treeitem', { name: /Waves/ }).click();
  await settle(page);
  await page.screenshot({ path: join(OUT, 'japanese-light.png') });
});
