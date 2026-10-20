import {useCallback, useEffect, useRef, useState, useSyncExternalStore} from 'react';
import type {JSX} from 'react';
import {useTranslation} from 'react-i18next';
import {Playground} from './playground.ts';
import {isEditingTarget, shouldDeleteSelection} from './keyboard.ts';
import {useCompactLayout} from './useCompactLayout.ts';
import {Drawer} from './components/Drawer.tsx';
import type {DrawerSide} from './components/Drawer.tsx';
import {NODE_NAMES, SCENARIOS, scenarioDesign} from './presets.ts';
import {NODE_KINDS, isScenarioId, parseDesign, serializeDesign} from './persistence.ts';
import type {BrowserStorage} from './persistence.ts';
import type {NodeKind} from './simulation.ts';
import type {TranslationKey} from './i18n/es.ts';
import {LANGUAGE_STORAGE} from './i18n/index.ts';
import {translateNotice} from './i18n/notice.ts';
import {DesignError} from './messages.ts';
import {Icon} from './components/Icon.tsx';
import {ArchitectureCanvas} from './components/ArchitectureCanvas.tsx';
import type {CanvasHandle} from './components/ArchitectureCanvas.tsx';
import {Inspector} from './components/Inspector.tsx';
import {Metrics, Observatory} from './components/Dashboard.tsx';
import {GuideModal} from './components/GuideModal.tsx';
import type {ModalKind} from './components/GuideModal.tsx';

const DESCRIPTIONS: Record<NodeKind, TranslationKey> = {
  source: 'sourceHelp',
  lb: 'lbHelp',
  service: 'serviceHelp',
  queue: 'queueHelp',
  cache: 'cacheHelp',
  db: 'dbHelp',
  sink: 'sinkHelp',
};
function browserStorage(): BrowserStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
export function App(): JSX.Element {
  const {t, i18n} = useTranslation();
  const [store] = useState(() => new Playground(scenarioDesign('pressure', t), browserStorage()));
  useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [modal, setModal] = useState<ModalKind | null>(null);
  const compact = useCompactLayout();
  const [desktopPanels, setDesktopPanels] = useState({library: true, inspector: true});
  const [mobilePanel, setMobilePanel] = useState<DrawerSide | null>(null);
  const libraryOpen = compact ? mobilePanel === 'library' : desktopPanels.library;
  const inspectorOpen = compact ? mobilePanel === 'inspector' : desktopPanels.inspector;
  const closeLibrary = useCallback((): void => {
    setMobilePanel(null);
    setDesktopPanels((panels) => ({...panels, library: false}));
  }, []);
  const closeInspector = useCallback((): void => {
    setMobilePanel(null);
    setDesktopPanels((panels) => ({...panels, inspector: false}));
  }, []);
  const inspectSelection = useCallback((): void => {
    if (compact) setMobilePanel('inspector');
    else setDesktopPanels((panels) => ({...panels, inspector: true}));
  }, [compact]);
  const togglePanel = (side: DrawerSide): void => {
    if (compact) setMobilePanel((panel) => (panel === side ? null : side));
    else setDesktopPanels((panels) => ({...panels, [side]: !panels[side]}));
  };
  const canvas = useRef<CanvasHandle>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const download = useRef<{url: string; timer: ReturnType<typeof setTimeout>} | null>(null);
  const closeModal = useCallback((): void => setModal(null), []);
  useEffect(() => {
    let frameId = 0;
    const frame = (now: number): void => {
      store.tick(now);
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        store.connecting = null;
        store.notify();
      }
    };
    document.addEventListener('keydown', escape);
    // Read-only diagnostics preserve the POC inspection interface.
    Object.defineProperty(window, 'flowLab', {
      configurable: true,
      value: {
        get simulation() {
          return store.simulation;
        },
        get design() {
          return structuredClone(store.design);
        },
        get running() {
          return store.running;
        },
      },
    });
    return () => {
      cancelAnimationFrame(frameId);
      document.removeEventListener('keydown', escape);
      Reflect.deleteProperty(window, 'flowLab');
    };
  }, [store]);
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.title = t('pageTitle');
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', t('pageDescription'));
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE, i18n.language);
    } catch {
      /* The simulator remains usable without browser storage. */
    }
  }, [i18n.language, t]);
  useEffect(
    () => () => {
      if (download.current) {
        clearTimeout(download.current.timer);
        URL.revokeObjectURL(download.current.url);
      }
    },
    [],
  );
  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      if (
        shouldDeleteSelection(event, isEditingTarget(event.target), modal !== null) &&
        (store.selected || store.selectedEdge)
      ) {
        event.preventDefault();
        store.deleteSelection();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [store, modal]);
  const exportDesign = (): void => {
    if (download.current) {
      clearTimeout(download.current.timer);
      URL.revokeObjectURL(download.current.url);
    }
    const blob = new Blob([serializeDesign(store.design, store.scenarioId)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'architecture.flowlab.json';
    anchor.click();
    download.current = {
      url,
      timer: setTimeout(() => {
        URL.revokeObjectURL(url);
        download.current = null;
      }, 1000),
    };
    store.showToast({code: 'exported'});
  };
  const importDesign = async (input: HTMLInputElement): Promise<void> => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1000000) throw new DesignError({code: 'fileTooLarge'});
      const raw: unknown = JSON.parse(await file.text());
      store.importDesign(parseDesign(raw));
    } catch (error: unknown) {
      store.showToast(error instanceof DesignError ? error.notice : {code: 'importFailed'});
    }
    input.value = '';
  };
  const seconds = Math.floor(store.simulation.time + 1e-7);
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <>
      <header className="app-header">
        <a className="brand" href="#" aria-label={t('home')}>
          <span className="brand-mark">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            Flow<span className="brand-lab">Lab</span>
            <small>{t('playground')}</small>
          </span>
        </a>
        <div className="header-center">
          <span className="live-dot" />
          {t('tagline')}
        </div>
        <div className="header-actions">
          <span className="save-status">
            {t(store.storageAvailable ? 'saved' : 'storageUnavailable')}
          </span>
          <select
            className="language-picker"
            aria-label={t('language')}
            value={i18n.language === 'en' ? 'en' : 'es'}
            onChange={(event) => {
              const language = event.currentTarget.value;
              if (language === 'es' || language === 'en') void i18n.changeLanguage(language);
            }}
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
          <button
            className="icon-button"
            title={t('export')}
            aria-label={t('export')}
            onClick={exportDesign}
          >
            <Icon name="export" />
          </button>
          <button
            className="icon-button"
            title={t('import')}
            aria-label={t('import')}
            onClick={() => importInput.current?.click()}
          >
            <Icon name="import" />
          </button>
          <button className="help-button" onClick={() => setModal('help')}>
            <Icon name="help" />
            {t('help')}
          </button>
        </div>
      </header>
      <section className="experiment-bar">
        <div className="experiment-picker">
          <span className="eyebrow">{t('experiment')}</span>
          <select
            aria-label={t('chooseExperiment')}
            value={store.scenarioId}
            onChange={(event) => {
              const id = event.currentTarget.value;
              if (isScenarioId(id)) store.loadScenario(id, scenarioDesign(id, t));
            }}
          >
            {SCENARIOS.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {t(scenario.title)}
              </option>
            ))}
          </select>
        </div>
        <div className="transport">
          <button
            className={`play-button ${store.running ? 'running' : ''}`}
            onClick={() => store.setRunning(!store.running)}
          >
            <Icon name={store.running ? 'pause' : 'play'} />
            <span>{t(store.running ? 'pause' : 'start')}</span>
          </button>
          <button
            className="plain-button"
            title={t('step')}
            disabled={store.running}
            onClick={() => store.step()}
          >
            +1 s
          </button>
          <button className="icon-button" aria-label={t('reset')} onClick={() => store.reset()}>
            <Icon name="reset" />
          </button>
          <span className="separator" />
          <select
            aria-label={t('speed')}
            value={store.speed}
            onChange={(event) => {
              store.speed = Number(event.currentTarget.value);
              store.notify();
            }}
          >
            {[0.5, 1, 2, 5].map((speed) => (
              <option key={speed} value={speed}>
                {speed}×
              </option>
            ))}
          </select>
          <span className="sim-clock">
            <Icon name="clock" />
            <b>{clock}</b>
          </span>
        </div>
        <button
          className={`burst-button ${store.simulation.bursting ? 'active' : ''}`}
          onClick={() => store.burst()}
        >
          <Icon name="burst" />
          {t('burst')}
          <span>5 s</span>
        </button>
      </section>
      <Metrics store={store} />
      <nav className="workspace-toolbar" aria-label={t('architecture')}>
        <button
          className={`panel-toggle ${libraryOpen ? 'active' : ''}`}
          aria-expanded={libraryOpen}
          aria-controls="library-drawer"
          onClick={() => togglePanel('library')}
        >
          <Icon name="plus" />
          {t('showComponents')}
        </button>
        <span className="selection-summary">
          {store.design.nodes.find((node) => node.id === store.selected)?.label ??
            (store.selectedEdge ? t('trafficRoute') : t('selectionHelp'))}
        </span>
        <button
          className="icon-button selection-delete"
          aria-label={t('deleteSelection')}
          title={t('deleteSelection')}
          disabled={!store.selected && !store.selectedEdge}
          onClick={() => store.deleteSelection()}
        >
          <Icon name="trash" />
        </button>
        <button
          className={`panel-toggle ${inspectorOpen ? 'active' : ''}`}
          aria-expanded={inspectorOpen}
          aria-controls="inspector-drawer"
          onClick={() => togglePanel('inspector')}
        >
          <Icon name="service" />
          {t('showInspector')}
        </button>
      </nav>
      <main
        className={`workspace ${libraryOpen ? 'with-library' : ''} ${inspectorOpen ? 'with-inspector' : ''}`}
      >
        <Drawer
          side="library"
          title={t('components')}
          open={libraryOpen}
          compact={compact}
          onClose={closeLibrary}
        >
          <div className="library-body">
            <p className="panel-intro">{t('componentIntro')}</p>
            <div className="component-list">
              {NODE_KINDS.map((kind) => (
                <button
                  key={kind}
                  className={`library-item type-${kind}`}
                  onClick={() => {
                    canvas.current?.addNode(kind, t(NODE_NAMES[kind]));
                    if (compact) setMobilePanel(null);
                  }}
                >
                  <span className="library-icon">
                    <Icon name={kind} />
                  </span>
                  <span>
                    <b>{t(NODE_NAMES[kind])}</b>
                    <small>{t(DESCRIPTIONS[kind])}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className="library-footer">
              <span className="live-dot" />
              <b>{t('localEngine')}</b>
              <p>{t('noInfra')}</p>
              <a
                href="https://github.com/MiguelChan/system-design-flow"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('github')}
              </a>
            </div>
          </div>
        </Drawer>
        <ArchitectureCanvas
          store={store}
          ref={canvas}
          onInspect={inspectSelection}
          onHint={() => setModal('hint')}
        />
        <Drawer
          side="inspector"
          title={t(
            store.selectedEdge ? 'connection' : store.selected ? 'configuration' : 'inspector',
          )}
          open={inspectorOpen}
          compact={compact}
          onClose={closeInspector}
        >
          <Inspector store={store} />
        </Drawer>
      </main>
      <Observatory store={store} />
      <footer className="footer">
        <span>{t('modelSummary')}</span>
        <button onClick={() => setModal('assumptions')}>{t('assumptions')}</button>
        <span>{t('learning')}</span>
      </footer>
      <div className={`toast ${store.toast ? 'show' : ''}`} role="status">
        {store.toast && translateNotice(t, store.toast)}
      </div>
      {modal && <GuideModal kind={modal} scenarioId={store.scenarioId} onClose={closeModal} />}
      <input
        ref={importInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          void importDesign(event.currentTarget);
        }}
      />
    </>
  );
}
