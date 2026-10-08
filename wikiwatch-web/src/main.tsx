import {followSystemTheme} from "./systemTheme";
import React from 'react';import {createRoot} from 'react-dom/client';import {App} from './App';import {ApiActivityIndicator} from './components/ui/loader';
followSystemTheme();
createRoot(document.getElementById('root')!).render(<><ApiActivityIndicator/><App/></>);
