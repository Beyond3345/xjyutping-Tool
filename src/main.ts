// xjyutping-Tool: the window is App.svelte; readings come from py/app.py under
// Pyodide (lib/python.ts), files and the PDF from src-tauri/src/main.rs.
import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'

mount(App, { target: document.getElementById('app')! })
