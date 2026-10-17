import { addGroup, addLayer, makeAsset, nameOf, type Asset } from '@fresnel/core';
import { bundleFromFiles, webPlatform, type Platform } from './platform';
import { useDoc } from './store/doc';
import { useUI } from './store/ui';
import { loadSample } from './sample';
import { t } from './i18n';

let platform: Platform = webPlatform;
export const setPlatform = (p: Platform) => {
  platform = p;
};
export const getPlatform = () => platform;

const fail = (e: unknown) => useUI.getState().toast('error', (e as Error).message || String(e));

function confirmDiscard(): boolean {
  return !useDoc.getState().dirty || window.confirm(t('unsavedConfirm'));
}

export async function openIcon() {
  if (!confirmDiscard()) return;
  try {
    const r = await platform.open();
    if (!r) return;
    useDoc.getState().load(r.doc, { name: r.name, location: r.location, extra: r.extra });
    useUI.getState().select({ kind: 'document' });
  } catch (e) {
    fail(e);
  }
}

export function openSample() {
  if (!confirmDiscard()) return;
  useDoc.getState().load(loadSample(), { name: 'Sample' });
  useUI.getState().select({ kind: 'document' });
}

export function newIcon() {
  if (!confirmDiscard()) return;
  useDoc.getState().newDocument();
  useUI.getState().select({ kind: 'document' });
}

/** Commits a value still being typed (fields commit on blur) before saving or exporting. */
export function commitPendingEdit() {
  const el = document.activeElement as HTMLElement | null;
  if (el && el !== document.body && el.matches('input, textarea')) el.blur();
}

export async function save(as = false) {
  commitPendingEdit();
  const s = useDoc.getState();
  try {
    const r = as || !platform.canSaveInPlace(s.location) ? await platform.saveAs(s.doc, s.extra, s.name, s.location) : await platform.save(s.doc, s.extra, s.name, s.location);
    if (!r) return;
    useDoc.getState().markSaved(r.location, r.name);
    useUI.getState().toast('success', t('saved'));
  } catch (e) {
    fail(e);
  }
}

/** Target group for new layers: the selected group / the selected layer's group / the frontmost group. */
function targetGroup(): string | null {
  const sel = useUI.getState().selection;
  const doc = useDoc.getState().doc;
  if (sel.kind === 'group') return sel.id;
  if (sel.kind === 'layer') return doc.groups.find((g) => g.layers.some((l) => l.id === sel.id))?.id ?? null;
  return doc.groups[0]?.id ?? null;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Adds image layers. Like Icon Composer, files are ordered by name and names
 * that count up ("1 back", "2 front") are stacked back to front. [推測]
 */
export function addAssets(assets: Asset[], groupName?: string) {
  const ok = assets.filter((a) => a.kind === 'svg' || a.kind === 'png' || a.kind === 'jpg');
  if (ok.length < assets.length) useUI.getState().toast('error', t('invalidFile'));
  if (!ok.length) return;
  const sorted = [...ok].sort(byName);
  let ids: string[] | undefined;
  if (groupName) {
    // the folder's group and its layers are one undo step
    ids = useDoc.getState().mutate((d) => {
      const g = d.groups.find((x) => nameOf(x) === groupName) ?? addGroup(d, { name: groupName });
      // add the highest name first so the first file ends up frontmost
      return [...sorted]
        .reverse()
        .map((a) => addLayer(d, g.id, a).id)
        .reverse();
    });
  } else {
    // addLayers puts its first item in front, so pass the highest name first
    ids = useDoc.getState().addLayers(targetGroup(), sorted.reverse());
  }
  if (ids?.length) useUI.getState().select({ kind: 'layer', id: ids[0]! });
}

export async function importLayers() {
  try {
    const files = await platform.pickImages();
    addAssets(files.map((f) => makeAsset(f.name, f.bytes)));
  } catch (e) {
    fail(e);
  }
}

/** Handles files dropped anywhere: an .icon bundle (folder or zip) opens, images become layers. */
export async function handleDrop(dt: DataTransfer) {
  try {
    const files = await collectDropped(dt);
    if (!files.length) return;
    const isBundle = files.some((f) => /\.zip$/i.test(f.name) || ((f as File & { webkitRelativePath?: string }).webkitRelativePath ?? f.name).endsWith('icon.json'));
    if (isBundle) {
      if (!confirmDiscard()) return;
      const r = await bundleFromFiles(files);
      if (!r) throw new Error(t('invalidFile'));
      useDoc.getState().load(r.doc, { name: r.name, location: r.location, extra: r.extra });
      return;
    }
    // folders become groups (named after the folder), loose files go to the selected / default group
    const groups = new Map<string, File[]>();
    for (const f of files) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const parts = rel.split('/');
      const key = parts.length > 1 ? parts[parts.length - 2]! : '';
      if (!/\.(svg|png|jpe?g)$/i.test(f.name)) continue;
      groups.set(key, [...(groups.get(key) ?? []), f]);
    }
    if (!groups.size) throw new Error(t('invalidFile'));
    const keys = [...groups.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const k of keys) {
      const assets = await Promise.all(groups.get(k)!.map(async (f) => makeAsset(f.name, new Uint8Array(await f.arrayBuffer()))));
      addAssets(assets, k || undefined);
    }
  } catch (e) {
    fail(e);
  }
}

/** Expands dropped folders (via webkitGetAsEntry) into files with webkitRelativePath set. */
async function collectDropped(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[];
  if (!entries.length) return [...dt.files];
  const out: File[] = [];
  const walk = async (entry: FileSystemEntry, path: string): Promise<void> => {
    if (entry.isFile) {
      const f = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      Object.defineProperty(f, 'webkitRelativePath', { value: path + f.name });
      out.push(f);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await walk(e, `${path}${entry.name}/`);
      }
    }
  };
  for (const e of entries) await walk(e, '');
  return out;
}
