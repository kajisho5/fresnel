import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8, zipSync, strToU8 } from 'fflate';

const STAR =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path d="M512 212 L594 420 L812 430 L640 566 L700 780 L512 660 L324 780 L384 566 L212 430 L430 420 Z" fill="#fff"/></svg>';

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => localStorage.setItem('fresnel.lang', 'en'));
  await page.goto('/');
  await expect(page.getByAltText('Default preview')).toBeVisible();
  return errors;
}

test('loads the sample without errors', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByRole('treeitem', { name: /Waves/ })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: /Wave Front/ })).toBeVisible();
  await expect(page.getByText('Approximate preview')).toBeVisible();
  expect(errors).toEqual([]);
});

test('edits a group value and undoes it', async ({ page }) => {
  await open(page);
  await page.getByRole('treeitem', { name: /Waves/ }).click();
  const field = page.getByRole('textbox', { name: 'Translucency' });
  await expect(field).toHaveValue('0.45');
  await field.fill('0.8');
  await field.press('Enter');
  await expect(field).toHaveValue('0.80');
  await expect(page.getByText('— Edited')).toBeVisible();
  await page.locator('body').click({ position: { x: 700, y: 120 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(field).toHaveValue('0.45');
});

test('writes a dark-only override', async ({ page }) => {
  await open(page);
  await page.getByRole('treeitem', { name: /Waves/ }).click();
  await page.getByRole('radio', { name: 'Dark', exact: true }).first().click();
  await page.getByRole('radio', { name: 'Current' }).click();
  await expect(page.getByText('Editing overrides for dark')).toBeVisible();
  const specular = page.getByRole('switch', { name: 'Specular' });
  await expect(specular).toHaveAttribute('aria-checked', 'true');
  await specular.click();
  await expect(specular).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('button', { name: 'Reset to base value' })).toBeVisible();
  await page.getByRole('radio', { name: 'Default', exact: true }).first().click();
  await expect(specular).toHaveAttribute('aria-checked', 'true');
});

test('adds a layer from a file', async ({ page }) => {
  await open(page);
  await page.getByRole('treeitem', { name: /Sun/ }).first().click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add layer…' }).first().click();
  await (await chooser).setFiles({ name: 'star.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(STAR) });
  await expect(page.getByRole('treeitem', { name: /star/ })).toBeVisible();
  await expect(page.getByText('2 groups · 4 layers')).toBeVisible();
});

test('opens a dropped .icon.zip', async ({ page }) => {
  await open(page);
  const zip = zipSync({
    'Dropped.icon/icon.json': strToU8(JSON.stringify({ fill: { solid: 'srgb:1,0,0,1' }, groups: [{ name: 'Only', layers: [{ 'image-name': 's.svg', name: 'Shape' }] }] })),
    'Dropped.icon/Assets/s.svg': strToU8(STAR),
  });
  await page.evaluate(async (bytes) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], 'Dropped.icon.zip', { type: 'application/zip' }));
    const root = document.querySelector('#root > div')!;
    root.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, [...zip]);
  await expect(page.getByRole('treeitem', { name: /Only/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dropped' })).toBeVisible();
});

test('compare shows all six appearances', async ({ page }) => {
  await open(page);
  await page.getByRole('radio', { name: 'Compare' }).click();
  for (const a of ['Default', 'Dark', 'Clear light', 'Clear dark', 'Tinted light', 'Tinted dark']) await expect(page.getByAltText(`${a} 128`, { exact: true })).toBeVisible();
  await expect(page.getByText('Not customized (V-08)').first()).toBeVisible();
});

test('exports a zip with the selected formats', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Export…' }).click();
  await page.getByRole('combobox', { name: 'PNG set' }).selectOption('default');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const file = await (await dl).path();
  const files = unzipSync(new Uint8Array(readFileSync(file!)));
  const names = Object.keys(files);
  expect(names).toContain('Sample.icon/icon.json');
  expect(names).toContain('Sample.icns');
  expect(names).toContain('Sample-png/default/icon-1024.png');
  expect(names.filter((n) => n.endsWith('.png'))).toHaveLength(7);
  expect(strFromU8(files['Sample.icns']!.subarray(0, 4))).toBe('icns');
  const json = JSON.parse(strFromU8(files['Sample.icon/icon.json']!));
  expect(json.groups.map((g: { name: string }) => g.name)).toEqual(['Waves', 'Sun']);
});

test('switches to Japanese', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: /日本語/ }).click();
  await expect(page.getByRole('radio', { name: '比較' })).toBeVisible();
});
