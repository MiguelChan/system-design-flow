import type {JSX, ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import type {Playground} from '../playground.ts';
import type {TranslationKey} from '../i18n/es.ts';
import {translateNotice} from '../i18n/notice.ts';

function Metric({
  label,
  children,
  description,
  tone = '',
}: {
  label: string;
  children: ReactNode;
  description: string;
  tone?: string;
}): JSX.Element {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={tone}>{children}</strong>
      <em>{description}</em>
    </div>
  );
}
export function Metrics({store}: {store: Playground}): JSX.Element {
  const {t, i18n} = useTranslation();
  const simulation = store.simulation;
  const sample = simulation.latest;
  const format = (value: number, digits = 0): string =>
    new Intl.NumberFormat(i18n.language, {maximumFractionDigits: digits}).format(value);
  return (
    <section className="metrics" aria-label={t('metrics')}>
      <Metric label={t('demand')} description={t('demandHelp')}>
        {format(sample.demand)}
        <small>req/s</small>
      </Metric>
      <Metric label={t('admitted')} description={t('admittedHelp')}>
        {format(sample.admitted)}
        <small>req/s</small>
      </Metric>
      <Metric label={t('completed')} description={t('completedHelp')} tone="mint">
        {format(sample.completed)}
        <small>req/s</small>
      </Metric>
      <Metric
        label={t('p95')}
        description={t('p95Help')}
        tone={simulation.p95 > 2000 ? 'warning' : ''}
      >
        {simulation.p95 ? format(simulation.p95) : '—'}
        <small>ms</small>
      </Metric>
      <Metric
        label={t('backlog')}
        description={t('oldest', {value: format(simulation.oldestAge, 1)})}
      >
        {format(simulation.backlog)}
        <small>req</small>
      </Metric>
      <Metric
        label={t('rejected')}
        description={t('throttled', {value: format(simulation.totals.throttled)})}
        tone={simulation.totals.rejected + simulation.totals.dropped ? 'warning' : ''}
      >
        {format(simulation.totals.rejected)} <small>/</small> {format(simulation.totals.dropped)}
      </Metric>
    </section>
  );
}
const SERIES = [
  {key: 'demand', label: 'chartDemand', color: '#8796ad'},
  {key: 'admitted', label: 'chartAdmitted', color: '#a28afa'},
  {key: 'completed', label: 'chartCompleted', color: '#5ce7bd'},
] as const;
export function Observatory({store}: {store: Playground}): JSX.Element {
  const {t, i18n} = useTranslation();
  const samples = store.simulation.samples.slice(-90);
  const maximum = Math.max(200, ...samples.map((sample) => sample.demand)) * 1.12;
  const labels: Record<(typeof SERIES)[number]['key'], TranslationKey> = {
    demand: 'chartDemand',
    admitted: 'chartAdmitted',
    completed: 'chartCompleted',
  };
  return (
    <section className="observatory">
      <div className="chart-panel">
        <div className="chart-heading">
          <b>{t('traffic')}</b>
          <div className="chart-legend">
            {SERIES.map((series) => (
              <span key={series.key}>
                <i
                  className={`${series.key === 'demand' ? 'demand' : series.key === 'admitted' ? 'admit' : 'complete'}-line`}
                />
                {t(labels[series.key])}
              </span>
            ))}
          </div>
          <small>{t('chartWindow')}</small>
        </div>
        <div className="chart-wrap">
          <svg
            className="traffic-chart"
            viewBox="0 0 800 160"
            preserveAspectRatio="none"
            role="img"
            aria-label={t('chartLabel')}
          >
            {[0, 1, 2, 3].map((index) => (
              <g key={index}>
                <line x1="40" x2="792" y1={12 + index * 40} y2={12 + index * 40} stroke="#26303d" />
                <text x="32" y={16 + index * 40} textAnchor="end" fill="#69778b" fontSize="10">
                  {new Intl.NumberFormat(i18n.language, {maximumFractionDigits: 0}).format(
                    maximum * (1 - index / 3),
                  )}
                </text>
              </g>
            ))}
            {!samples.length && (
              <text x="400" y="80" textAnchor="middle" fill="#65748b" fontSize="12">
                {t('chartEmpty')}
              </text>
            )}
            {SERIES.map((series) => (
              <polyline
                key={series.key}
                fill="none"
                stroke={series.color}
                strokeWidth={series.key === 'completed' ? 2.4 : 1.6}
                strokeDasharray={series.key === 'demand' ? '4 4' : undefined}
                points={samples
                  .map(
                    (sample, index) =>
                      `${40 + (index * 746) / Math.max(30, samples.length - 1)},${12 + (1 - sample[series.key] / maximum) * 120}`,
                  )
                  .join(' ')}
              />
            ))}
          </svg>
          <span className="chart-unit">req/s</span>
        </div>
      </div>
      <div className="events-panel">
        <div className="chart-heading">
          <b>{t('events')}</b>
          <span className="live-dot" />
        </div>
        <div className="events">
          {store.simulation.logs.slice(0, 7).map((entry, index) => (
            <div className={`event ${entry.tone}`} key={`${entry.time}-${index}`}>
              <time>{entry.time.toFixed(1)}s</time>
              <i />
              <span>{translateNotice(t, entry.message)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
