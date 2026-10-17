import { useEffect, useRef, useState } from 'react';
import { History } from 'lucide-react';
import { useDoc } from '../store/doc';
import { useUI } from '../store/ui';
import { t, useLang } from '../i18n';
import { clearSnapshot, readSnapshot, restoreSnapshot, writeSnapshot, type Snapshot } from '../lib/autosave';
import { Button } from './controls';

const DEBOUNCE_MS = 1500;
const MAX_WAIT_MS = 30_000;

/**
 * Offers to restore the last unsaved session, then keeps a recovery snapshot
 * up to date while the document is dirty.
 */
export function Recovery() {
  useLang();
  const [pending, setPending] = useState<Snapshot | null>(null);
  const [ready, setReady] = useState(false);
  const doc = useDoc((s) => s.doc);
  const dirty = useDoc((s) => s.dirty);
  const name = useDoc((s) => s.name);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const firstChange = useRef<number | null>(null);

  // 1) look for a snapshot left by a previous session
  useEffect(() => {
    let alive = true;
    readSnapshot().then((s) => {
      if (!alive) return;
      setPending(s);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 2) keep the snapshot fresh while there are unsaved changes (paused until the restore question is answered)
  useEffect(() => {
    if (!ready || pending) return;
    if (!dirty) {
      firstChange.current = null;
      clearTimeout(timer.current);
      clearSnapshot();
      return;
    }
    const now = Date.now();
    firstChange.current ??= now;
    const wait = Math.max(0, Math.min(DEBOUNCE_MS, firstChange.current + MAX_WAIT_MS - now));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const s = useDoc.getState();
      if (!s.dirty) return;
      writeSnapshot(s.doc, s.extra, s.name, s.location)
        .then(() => (firstChange.current = null))
        .catch(() => undefined);
    }, wait);
    return () => clearTimeout(timer.current);
  }, [doc, dirty, name, ready, pending]);

  // flush immediately when the page is hidden / closed
  useEffect(() => {
    const flush = () => {
      const s = useDoc.getState();
      if (ready && !pending && s.dirty) writeSnapshot(s.doc, s.extra, s.name, s.location).catch(() => undefined);
    };
    const onVis = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
    };
  }, [ready, pending]);

  if (!pending) return null;
  const when = new Date(pending.savedAt).toLocaleString();
  return (
    <div role="alertdialog" aria-labelledby="recovery-title" className="fixed top-[64px] left-1/2 z-[55] w-[460px] -translate-x-1/2 rounded-xl border border-hairline bg-elevated p-4 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
      <div className="flex gap-3">
        <History className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <h2 id="recovery-title" className="m-0 text-[13px] font-semibold">
            {t('recoveryTitle')}
          </h2>
          <p className="m-0 mt-1 text-xs text-t2">{t('recoveryBody', { name: pending.name, when })}</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              onClick={() => {
                clearSnapshot();
                setPending(null);
              }}
            >
              {t('discard')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                try {
                  const r = restoreSnapshot(pending);
                  useDoc.getState().load(r.doc, { name: r.name, location: r.location, extra: r.extra });
                  useDoc.setState({ dirty: true });
                  useUI.getState().select({ kind: 'document' });
                  useUI.getState().toast('success', t('restored'));
                } catch (e) {
                  useUI.getState().toast('error', (e as Error).message);
                  clearSnapshot();
                }
                setPending(null);
              }}
            >
              {t('restore')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
