import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { baseValue, squarePlatforms, summarizeIssues, validate, type Issue } from '@fresnel/core';
import { useDoc } from '../store/doc';
import { useUI } from '../store/ui';
import { t, useLang } from '../i18n';
import { getPlatform } from '../actions';

export function IssueIcon({ s, className = 'h-3.5 w-3.5' }: { s: Issue['severity']; className?: string }) {
  if (s === 'error') return <XCircle aria-label="Error" className={`${className} text-err`} />;
  if (s === 'warning') return <AlertTriangle aria-label="Warning" className={`${className} text-warn`} />;
  return <Info aria-label="Info" className={`${className} text-t2`} />;
}

export function useIssues() {
  const doc = useDoc((s) => s.doc);
  return useMemo(() => validate(doc), [doc]);
}

export function useActool() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    getPlatform()
      .actoolAvailable()
      .then(setOk, () => setOk(false));
  }, []);
  return ok;
}

export function StatusBar() {
  useLang();
  const doc = useDoc((s) => s.doc);
  const issues = useIssues();
  const { issuesOpen, set, select } = useUI();
  const actool = useActool();
  const sum = summarizeIssues(issues);
  const platforms = baseValue(doc.props['supported-platforms']) as { squares?: unknown; circles?: string[] } | undefined;
  const plat = [platforms?.squares === undefined ? null : squarePlatforms(platforms.squares) === 'shared' ? t('squaresShared') : (squarePlatforms(platforms.squares) as string[]).join(', '), platforms?.circles?.length ? t('circlesList', { list: platforms.circles.join(', ') }) : null].filter(Boolean).join(' · ');
  const cs = (baseValue(doc.props['color-space-for-untagged-svg-colors']) as string | undefined) ?? 'display-p3';

  return (
    <footer className="relative flex h-6 shrink-0 items-center gap-4 border-t border-sep bg-window px-4 text-[11px] text-t2">
      <span>
        1024 × 1024 · {cs === 'srgb' ? 'sRGB' : 'Display P3'}
        {plat && ` · ${plat}`}
      </span>
      <button type="button" onClick={() => set({ issuesOpen: !issuesOpen })} className="ml-auto flex items-center gap-1.5 hover:text-t1" aria-expanded={issuesOpen}>
        {sum.errors + sum.warnings === 0 ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-ok" />
            {t('noIssues')}
          </>
        ) : (
          <>
            {sum.errors > 0 && <IssueIcon s="error" />}
            {sum.warnings > 0 && <IssueIcon s="warning" />}
            {t('issueCount', { n: sum.errors + sum.warnings, s: sum.errors + sum.warnings === 1 ? '' : 's' })}
          </>
        )}
      </button>
      <span>{actool ? t('actoolOK') : t('actoolNA')}</span>
      {issuesOpen && (
        <div className="absolute right-4 bottom-8 z-40 max-h-[50vh] w-[420px] overflow-y-auto rounded-[10px] border border-hairline bg-elevated p-2 text-xs text-t1 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
          {issues.length === 0 && <p className="p-3 text-t2">{t('noIssues')}</p>}
          {issues.map((i, k) => (
            <button
              key={k}
              type="button"
              onClick={() => i.ref && select(i.ref)}
              className="flex w-full gap-2 rounded-md p-2 text-left hover:bg-hover"
            >
              <IssueIcon s={i.severity} className="mt-px h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0">
                <span className="font-mono text-[10px] text-t3">
                  {i.id} · {i.target}
                </span>
                <br />
                {i.message}
              </span>
            </button>
          ))}
        </div>
      )}
    </footer>
  );
}
