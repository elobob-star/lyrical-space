import { render } from 'preact';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/courier-prime/latin-400.css';
import '@fontsource/courier-prime/latin-700.css';
import '@fontsource/courier-prime/latin-400-italic.css';
import '@fontsource/doto/latin-700.css';
import './styles/tokens.css';
import './styles/chassis.css';
import './styles/surfaces.css';
import { App } from './app';

render(<App />, document.getElementById('app')!);

// the installed web app (iPhone: Share → Add to Home Screen) keeps working offline
if ('serviceWorker' in navigator && import.meta.env.PROD && !/^capacitor:|^ionic:/.test(location.protocol) && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('sw.js').catch(() => { /* optional */ }); });
}
