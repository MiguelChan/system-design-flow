import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {I18nextProvider} from 'react-i18next';
import {App} from './App.tsx';
import {i18n} from './i18n/index.ts';
import './style.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </StrictMode>,
);
