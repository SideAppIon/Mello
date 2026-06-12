import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Restore path after GitHub Pages 404 redirect
(function () {
  const params = new URLSearchParams(window.location.search);
  const p = params.get('p');
  if (p) {
    const decoded = decodeURIComponent(p);
    const newSearch = decoded.includes('&') ? '?' + decoded.split('&').slice(1).join('&') : '';
    const newPath = '/' + decoded.split('&')[0];
    window.history.replaceState(null, '', newPath + newSearch + window.location.hash);
  }
}());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
