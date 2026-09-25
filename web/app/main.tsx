import React from 'react';
import { createRoot } from 'react-dom/client';
import Home from './game';
import './game.css';
import './games.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Home />
  </React.StrictMode>,
);
