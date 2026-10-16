import { readBundle, type IconDocument } from '@fresnel/core';
import iconJson from '../../../fixtures/Sample.icon/icon.json?raw';
import sun from '../../../fixtures/Sample.icon/Assets/sun.svg?raw';
import waveBack from '../../../fixtures/Sample.icon/Assets/wave-back.svg?raw';
import waveFront from '../../../fixtures/Sample.icon/Assets/wave-front.svg?raw';

const enc = new TextEncoder();

/** The fictional sample icon from fixtures/Sample.icon. */
export function loadSample(): IconDocument {
  return readBundle({
    'icon.json': enc.encode(iconJson),
    'Assets/sun.svg': enc.encode(sun),
    'Assets/wave-back.svg': enc.encode(waveBack),
    'Assets/wave-front.svg': enc.encode(waveFront),
  });
}
