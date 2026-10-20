import {useEffect, useRef} from 'react';
import type {JSX} from 'react';
import {useTranslation} from 'react-i18next';
import type {TranslationKey} from '../i18n/es.ts';
import type {ScenarioId} from '../presets.ts';
import {getScenario} from '../presets.ts';
import {Icon} from './Icon.tsx';

export type ModalKind = 'help' | 'hint' | 'assumptions';
const ASSUMPTIONS: readonly TranslationKey[] = [
  'assumptionTick',
  'assumptionRoute',
  'assumptionLb',
  'assumptionPrefetch',
  'assumptionReplicas',
  'assumptionBudgets',
  'assumptionOffline',
  'assumptionP95',
  'assumptionLimit',
  'assumptionScope',
];
const REFERENCES: readonly {label: TranslationKey; url: string}[] = [
  {label: 'referenceFlow', url: 'https://www.rabbitmq.com/docs/flow-control'},
  {label: 'referenceAck', url: 'https://www.rabbitmq.com/docs/confirms'},
  {label: 'referenceBuckets', url: 'https://datatracker.ietf.org/doc/rfc3290/'},
  {label: 'referenceConcurrency', url: 'https://github.com/Netflix/concurrency-limits'},
];
export function GuideModal({
  kind,
  scenarioId,
  onClose,
}: {
  kind: ModalKind;
  scenarioId: ScenarioId;
  onClose: () => void;
}): JSX.Element {
  const {t} = useTranslation();
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    if (!element) return;
    element.querySelector<HTMLButtonElement>('button')?.focus();
    const keydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key !== 'Tab') return;
      const focusable = element.querySelectorAll<HTMLElement>('button, a[href]');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    element.addEventListener('keydown', keydown);
    return () => {
      element.removeEventListener('keydown', keydown);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={dialog}
      >
        <button id="modal-close" className="icon-button" aria-label={t('close')} onClick={onClose}>
          <Icon name="close" />
        </button>
        <span className="eyebrow">{t('guide')}</span>
        <h2 id="modal-title">
          {t(kind === 'help' ? 'helpTitle' : kind === 'hint' ? 'hintTitle' : 'assumptionsTitle')}
        </h2>
        {kind === 'help' && (
          <>
            <p>{t('helpIntro')}</p>
            <ol>
              {(['helpSelect', 'helpObserve', 'helpBurst', 'helpBuild'] as const).map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ol>
            <div className="modal-callout">{t('helpColors')}</div>
            <p>{t('helpKeys')}</p>
          </>
        )}
        {kind === 'hint' && (
          <>
            <p>{t(getScenario(scenarioId).hint)}</p>
            <div className="modal-callout">{t('hintCallout')}</div>
          </>
        )}
        {kind === 'assumptions' && (
          <>
            <p>{t('assumptionsIntro')}</p>
            <ul>
              {ASSUMPTIONS.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
            <p>
              {t('references')}:{' '}
              {REFERENCES.map((reference) => (
                <a
                  key={reference.url}
                  href={reference.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t(reference.label)} ↗{' '}
                </a>
              ))}
            </p>
          </>
        )}
        <button className="play-button" onClick={onClose}>
          {t('understood')}
          <Icon name="arrow" />
        </button>
      </section>
    </div>
  );
}
