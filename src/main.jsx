import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { getDefaultTheme, readThemeMode, applyTheme } from './theme.js';

const mode = readThemeMode();
applyTheme(mode === 'follow' ? getDefaultTheme() : mode);
createRoot(document.getElementById('root')).render(<App />);
