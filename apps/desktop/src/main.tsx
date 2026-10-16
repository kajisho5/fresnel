import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@fresnel/ui';
import '@fresnel/ui/styles.css';
import { desktopPlatform } from './platform';

if (navigator.userAgent.includes('Mac')) document.documentElement.classList.add('mac-titlebar');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App platform={desktopPlatform} />
  </StrictMode>,
);
