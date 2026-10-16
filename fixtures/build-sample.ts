/** Builds fixtures/Sample.icon (fictional sample used by tests, docs and the web demo). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addGroup, addLayer, createDocument, makeAsset, setProp } from '@fresnel/core';
import { saveIcon } from '@fresnel/core/node';

const here = new URL('.', import.meta.url).pathname;
const svg = (f: string) => makeAsset(f, new Uint8Array(readFileSync(join(here, 'src', f))));

const doc = createDocument({ background: 'gradient:#3D7BFF,#0E2A8A' });
setProp(doc, { kind: 'document' }, 'fill', 'gradient:#1A2140,#070A14', 'dark');

const waves = addGroup(doc, { name: 'Waves' });
setProp(doc, { kind: 'group', id: waves.id }, 'translucency', { enabled: true, value: 0.45 });
setProp(doc, { kind: 'group', id: waves.id }, 'blur-material', 0.3);
const back = addLayer(doc, waves.id, svg('wave-back.svg'), { name: 'Wave Back', props: { opacity: 0.55, glass: true } });
const front = addLayer(doc, waves.id, svg('wave-front.svg'), { name: 'Wave Front', props: { opacity: 0.85, glass: true } });
void back;
void front;

const sun = addGroup(doc, { name: 'Sun', index: 1 });
setProp(doc, { kind: 'group', id: sun.id }, 'translucency', { enabled: false, value: 0.5 });
addLayer(doc, sun.id, svg('sun.svg'), { name: 'Sun', props: { glass: true } });

await saveIcon(join(here, 'Sample.icon'), doc);
console.log('wrote fixtures/Sample.icon');
