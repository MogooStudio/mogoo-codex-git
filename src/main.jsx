import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { readTheme, applyTheme } from './theme.js';

applyTheme(readTheme());
createRoot(document.getElementById('root')).render(<App />);
