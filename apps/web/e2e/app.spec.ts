import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8, zipSync, strToU8 } from 'fflate';

const STAR =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400"><path d="M200 20 L250 150 L390 150 L280 240 L320 380 L200 300 L80 380 L120 240 L10 150 L150 150 Z" fill="#fff"/></svg>';

async function open(page: Page, path = '/') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => {
    localStorage.setItem('fresnel.lang', 'en');
  });
  await page.goto(path);
  await expect(page.getByAltText('iOS default preview')).toBeVisible();
  return errors;
}

const field = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true }).first();

test('loads the sample without errors', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByRole('treeitem', { name: /Waves/ })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: /Wave Front/ })).toBeVisible();
  for (const p of ['iOS, macOS', 'watchOS']) await expect(page.getByRole('radio', { name: p, exact: true })).toBeVisible();
  for (const a of ['Default', 'Dark', 'Mono']) await expect(page.getByRole('radio', { name: a, exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('edits a group value and undoes it', async ({ page }) => {
  await open(page);
  await page.getByRole('treeitem', { name: /Waves/ }).click();
  const tr = field(page, 'Translucency');
  await expect(tr).toHaveValue('45%');
  await tr.fill('*2');
  await tr.press('Enter');
  await expect(tr).toHaveValue('90%');
  await expect(page.getByText('— Edited')).toBeVisible();
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect(tr).toHaveValue('45%');
  await page.getByRole('button', { name: /^Redo/ }).click();
  await expect(tr).toHaveValue('90%');
});

test('edits only the dark appearance with the section scope', async ({ page }) => {
  await open(page);
  await page.getByRole('treeitem', { name: /Waves/ }).click();
  await page.getByRole('radio', { name: 'Dark', exact: true }).click();
  await page.getByRole('combobox', { name: 'Liquid Glass: Applies to' }).selectOption('variant');
  await expect(page.getByText('Edits apply to Dark only')).toBeVisible();
  await page.getByRole('combobox', { name: 'Specular' }).selectOption('off');
  await page.getByRole('combobox', { name: 'Liquid Glass: Applies to' }).selectOption('all');
  // base value unchanged, Dark variant listed below it
  await expect(page.getByRole('combobox', { name: 'Specular' }).first()).toHaveValue('automatic');
  await expect(page.getByRole('button', { name: 'Remove variant Dark' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove variant Dark' }).click();
  await expect(page.getByRole('button', { name: 'Remove variant Dark' })).toHaveCount(0);
});

test('adds a platform variant with "Vary for"', async ({ page }) => {
  await open(page);
  await page.getByRole('treeitem', { name: /Sun/ }).first().click();
  await page.getByRole('radio', { name: 'watchOS', exact: true }).click();
  await page.getByRole('button', { name: 'Opacity: Add a variant' }).click({ force: true });
  await page.getByRole('menuitem', { name: 'Vary for watchOS' }).click();
  await expect(page.getByRole('button', { name: 'Remove variant watchOS' })).toBeVisible();
});

test('mono options switch clear / tinted', async ({ page }) => {
  await open(page);
  await page.getByRole('radio', { name: 'Mono', exact: true }).click();
  await expect(page.getByAltText('iOS clear-light preview')).toBeVisible();
  await page.getByRole('button', { name: 'Mono options' }).click();
  await page.getByRole('switch', { name: 'Tinted' }).click();
  await page.getByRole('dialog', { name: 'Mono options' }).getByRole('radio', { name: 'Dark' }).click();
  await expect(page.getByAltText('iOS tinted-dark preview')).toBeVisible();
});

test('adds a layer from a file and moves it on the canvas', async ({ page }) => {
  await open(page);
  await page.getByRole('treeitem', { name: /Sun/ }).first().click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Image…' }).click();
  await (await chooser).setFiles({ name: 'star.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(STAR) });
  await expect(page.getByRole('treeitem', { name: /star/ })).toBeVisible();
  await expect(page.getByText('2 groups · 4 layers')).toBeVisible();
  // drag the star (centered, 400pt) on the canvas
  const box = (await page.getByTestId('selection-box').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  await expect(field(page, 'X')).not.toHaveValue('0');
  // arrow key nudge
  const x = Number(await field(page, 'X').inputValue());
  await page.locator('body').press('ArrowRight');
  await expect(field(page, 'X')).toHaveValue(String(Math.round((x + 1) * 10) / 10));
});

test('context menu duplicates and deletes', async ({ page }) => {
  await open(page);
  await page.getByRole('treeitem', { name: /Wave Back/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Duplicate/ }).click();
  await expect(page.getByRole('treeitem', { name: /Wave Back copy/ })).toBeVisible();
  await page.getByRole('treeitem', { name: /Wave Back copy/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Delete|Remove/ }).click();
  await expect(page.getByRole('treeitem', { name: /Wave Back copy/ })).toHaveCount(0);
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
    document.querySelector('#root > div')!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, [...zip]);
  await expect(page.getByRole('treeitem', { name: /Only/ })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Dropped' })).toBeVisible();
});

test('compare shows all mono variants', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /Compare/ }).click();
  for (const a of ['Default', 'Dark', 'Mono · Clear light', 'Mono · Clear dark', 'Mono · Tinted light', 'Mono · Tinted dark'])
    await expect(page.getByAltText(`${a} 128`, { exact: true })).toBeVisible();
});

test('restores unsaved changes after a reload', async ({ page }) => {
  await open(page);
  await page.getByRole('treeitem', { name: /Waves/ }).click();
  await field(page, 'Translucency').fill('70');
  await field(page, 'Translucency').press('Enter');
  await page.waitForTimeout(2200); // autosave debounce
  await page.reload();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('treeitem', { name: /Waves/ }).click();
  await expect(field(page, 'Translucency')).toHaveValue('70%');
  await expect(page.getByText('— Edited')).toBeVisible();
});

test('exports a zip with App Store–ready icons', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Export…' }).click();
  await page.getByRole('checkbox', { name: 'AppIcon.appiconset' }).check();
  await page.getByRole('combobox', { name: 'PNG set' }).selectOption('default');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const files = unzipSync(new Uint8Array(readFileSync((await (await dl).path())!)));
  const names = Object.keys(files);
  expect(names).toContain('Sample.icon/icon.json');
  expect(names).toContain('Sample.icns');
  expect(names).toContain('AppIcon.appiconset/Contents.json');
  expect(strFromU8(files['Sample.icns']!.subarray(0, 4))).toBe('icns');
  // iOS 1024 icon: RGB PNG (color type 2), no alpha
  expect(files['AppIcon.appiconset/AppIcon.png']![25]).toBe(2);
  expect(JSON.parse(strFromU8(files['Sample.icon/icon.json']!)).groups.map((g: { name: string }) => g.name)).toEqual(['Waves', 'Sun']);
});

test('switches to Japanese and light theme', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: /日本語/ }).click();
  await expect(page.getByRole('button', { name: /比較/ })).toBeVisible();
  await page.getByRole('button', { name: 'メニュー' }).click();
  await page.getByRole('menuitem', { name: /テーマ/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('dirty flag follows the saved state', async ({ page }) => {
  await open(page);
  await page.locator('body').press('Control+z');
  await expect(page.getByText('— Edited')).toHaveCount(0);
  await page.getByRole('treeitem', { name: /Waves/ }).click();
  const tr = field(page, 'Translucency');
  await tr.focus();
  await tr.press('Tab');
  await expect(page.getByText('— Edited')).toHaveCount(0);
  await tr.fill('60');
  await tr.press('Enter');
  await expect(page.getByText('— Edited')).toBeVisible();
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect(tr).toHaveValue('45%');
  await expect(page.getByText('— Edited')).toHaveCount(0);
});

test('undo works right after a slider step', async ({ page }) => {
  await open(page);
  await page.getByRole('treeitem', { name: /Waves/ }).click();
  const slider = page.getByRole('slider', { name: 'Translucency' });
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(field(page, 'Translucency')).toHaveValue('46%');
  await slider.press('Control+z');
  await expect(field(page, 'Translucency')).toHaveValue('45%');
});

test('drag reorders groups where the indicator shows', async ({ page }) => {
  await open(page);
  const sun = page.getByRole('treeitem', { name: /Sun/ }).first();
  const waves = page.getByRole('treeitem', { name: /Waves/ });
  const box = (await waves.boundingBox())!;
  await sun.dragTo(waves, { targetPosition: { x: box.width / 2, y: 3 } });
  const names = (await page.getByRole('treeitem').allInnerTexts()).map((n) => n.split('\n')[0]!.trim());
  expect(names.indexOf('Sun')).toBeLessThan(names.indexOf('Waves'));
  // and dragging it back below Waves (lower half of the last row) restores the order
  await page.getByRole('treeitem', { name: /Sun/ }).first().dragTo(waves, { targetPosition: { x: box.width / 2, y: box.height - 3 } });
  const after = (await page.getByRole('treeitem').allInnerTexts()).map((n) => n.split('\n')[0]!.trim());
  expect(after.indexOf('Waves')).toBeLessThan(after.indexOf('Sun'));
});

test('a variant can store the default value', async ({ page }) => {
  await open(page);
  await page.getByRole('treeitem', { name: /Wave Front/ }).click();
  const blend = page.getByRole('combobox', { name: 'Blend Mode' }).first();
  await blend.selectOption('multiply');
  await page.getByRole('radio', { name: 'Dark', exact: true }).click();
  await page.getByRole('combobox', { name: 'Color: Applies to' }).selectOption('variant');
  await page.getByRole('combobox', { name: 'Blend Mode' }).first().selectOption('normal');
  await expect(page.getByRole('combobox', { name: 'Blend Mode' }).first()).toHaveValue('normal');
  await page.getByRole('combobox', { name: 'Color: Applies to' }).selectOption('all');
  await expect(page.getByRole('combobox', { name: 'Blend Mode' }).first()).toHaveValue('multiply');
  await expect(page.getByRole('button', { name: 'Remove variant Dark' })).toBeVisible();
});

async function addStar(page: Page) {
  await page.getByRole('treeitem', { name: /Sun/ }).first().click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Image…' }).click();
  await (await chooser).setFiles({ name: 'star.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(STAR) });
  await expect(page.getByRole('treeitem', { name: /star/ })).toBeVisible();
}

test('selects several layers, shows mixed values and aligns them', async ({ page }) => {
  await open(page);
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await addStar(page); // 400 pt star, centered, selected
  await page.getByRole('treeitem', { name: /Wave Back/ }).click({ modifiers: [mod] });
  await expect(page.getByText('2 Layers')).toBeVisible();
  await expect(page.getByTestId('selection-union')).toBeVisible();
  // opacity differs (1 vs 0.55): the field shows a dash
  await expect(field(page, 'Opacity')).toHaveValue('—');
  await page.getByRole('button', { name: 'Align: Left Edges' }).click();
  await page.getByRole('treeitem', { name: /star/ }).click();
  await expect(field(page, 'X')).toHaveValue('-312');
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect(field(page, 'X')).toHaveValue('0');
  // editing a mixed field sets every selected layer
  await page.getByRole('treeitem', { name: /Wave Back/ }).click({ modifiers: [mod] });
  await field(page, 'Opacity').fill('40');
  await field(page, 'Opacity').press('Enter');
  await page.getByRole('treeitem', { name: /Wave Back/ }).click();
  await expect(field(page, 'Opacity')).toHaveValue('40%');
  await page.getByRole('treeitem', { name: /star/ }).click();
  await expect(field(page, 'Opacity')).toHaveValue('40%');
});

test('marquee selects layers and ⌘G groups them', async ({ page }) => {
  await open(page);
  const stage = (await page.getByTestId('stage').boundingBox())!;
  // drag from the empty top-left corner of the stage across the icon
  await page.mouse.move(stage.x + 8, stage.y + 8);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2, { steps: 8 });
  await expect(page.getByTestId('marquee')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByText(/\d Layers/)).toBeVisible();
  await page.locator('body').press(process.platform === 'darwin' ? 'Meta+g' : 'Control+g');
  await expect(page.getByText(/3 groups/)).toBeVisible();
});

test('context menu Align submenu aligns one layer to the canvas', async ({ page }) => {
  await open(page);
  await addStar(page);
  await page.getByRole('treeitem', { name: /star/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Align' }).hover();
  await page.getByRole('menuitem', { name: 'Top Edges' }).click();
  await expect(field(page, 'Y')).toHaveValue('-312');
  // keyboard: open the submenu with → and pick with Enter
  await page.getByRole('treeitem', { name: /star/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Align' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menuitem', { name: 'Left Edges' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(field(page, 'X')).toHaveValue('-312');
});

// ---------------------------------------------------------------- regressions from the bug hunt (v0.2.1)

test('⌘Z while a slider has focus undoes one step and keeps redo', async ({ page }) => {
  await open(page);
  await page.getByRole('treeitem', { name: /Waves/ }).click();
  const op = field(page, 'Opacity');
  await op.fill('50');
  await op.press('Enter');
  const slider = page.getByRole('slider', { name: 'Translucency' });
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(field(page, 'Translucency')).toHaveValue('46%');
  await slider.press('Control+z');
  await expect(field(page, 'Translucency')).toHaveValue('45%');
  await expect(page.getByRole('button', { name: /^Redo/ })).toBeEnabled();
  await slider.press('Control+z');
  await expect(field(page, 'Translucency')).toHaveValue('45%');
  await expect(field(page, 'Opacity')).not.toHaveValue('50%');
  await slider.press('Control+Shift+z');
  await expect(field(page, 'Opacity')).toHaveValue('50%');
});

test('Escape in a number field cancels the typed value', async ({ page }) => {
  await open(page);
  await page.getByRole('treeitem', { name: /Waves/ }).click();
  const tr = field(page, 'Translucency');
  await tr.fill('80');
  await tr.press('Escape');
  await expect(tr).toHaveValue('45%');
  await expect(page.getByText('— Edited')).toHaveCount(0);
});

test('a renamed document stays edited after undo', async ({ page }) => {
  await open(page);
  await page.getByTitle('Rename', { exact: true }).first().click();
  const nameBox = page.getByRole('textbox', { name: 'Document name' });
  await nameBox.fill('Renamed');
  await nameBox.press('Enter');
  await expect(page.getByText('— Edited')).toBeVisible();
  await page.getByRole('treeitem', { name: /Waves/ }).click();
  const tr = field(page, 'Translucency');
  await tr.fill('60');
  await tr.press('Enter');
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect(tr).toHaveValue('45%');
  await expect(page.getByText('— Edited')).toBeVisible();
});

test('a group dropped on the lower half of a layer row goes after that group', async ({ page }) => {
  await open(page);
  const back = page.getByRole('treeitem', { name: /Wave Back/ });
  const box = (await back.boundingBox())!;
  await page.getByRole('treeitem', { name: /Sun/ }).first().dragTo(back, { targetPosition: { x: box.width / 2, y: box.height - 3 } });
  const names = (await page.getByRole('treeitem').allInnerTexts()).map((n) => n.split('\n')[0]!.trim());
  expect(names.indexOf('Waves')).toBeLessThan(names.indexOf('Sun'));
  expect(names.indexOf('Wave Back')).toBeLessThan(names.indexOf('Sun'));
});

test('paste style keeps the target visible', async ({ page }) => {
  await open(page);
  await page.getByRole('treeitem', { name: /Wave Front/ }).click();
  await page.locator('body').press('Control+Shift+h');
  await page.locator('body').press('Control+Alt+c');
  await page.getByRole('treeitem', { name: /Wave Back/ }).click();
  await page.locator('body').press('Control+Alt+v');
  const back = page.getByRole('treeitem', { name: /Wave Back/ });
  await expect(back.getByRole('button', { name: 'Show', exact: true })).toHaveCount(0);
  await expect(page.getByRole('treeitem', { name: /Wave Front/ }).getByRole('button', { name: 'Show', exact: true })).toHaveCount(1);
});

test('shortcuts do not edit the document while the export sheet is open', async ({ page }) => {
  await open(page);
  await page.getByRole('treeitem', { name: /Wave Back/ }).click();
  const before = await page.getByRole('treeitem').count();
  await page.locator('body').press('Control+Shift+e');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Control+d');
  await page.keyboard.press('Control+g');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('treeitem')).toHaveCount(before);
  await expect(page.getByText('— Edited')).toHaveCount(0);
});
