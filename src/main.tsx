import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/main.css';
import { App } from './App';

const rootEl = document.getElementById('app');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}


