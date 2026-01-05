/**
 * DivertScan™ Apex Enterprise - Main Entry Point
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Remove loading screen once React is ready
document.body.classList.add('app-loaded');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
