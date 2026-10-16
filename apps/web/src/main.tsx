import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, loadSample, useDoc, webPlatform } from '@fresnel/ui';
import '@fresnel/ui/styles.css';

// Start with the fictional sample so first-time visitors see something.
if (!new URLSearchParams(location.search).has('empty')) useDoc.getState().load(loadSample(), { name: 'Sample' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App platform={webPlatform} />
  </StrictMode>,
);
