import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { settings } from './lib/settings.svelte.ts';

async function start(): Promise<void> {
  // Settings come from asynchronous storage: load them first so the first paint is in the right language.
  try {
    await settings.load();
  } catch {
    // Storage is unavailable: run with the defaults.
  }
  const target = document.getElementById('app');
  if (!target) throw new Error('Missing #app element');
  mount(App, { target });
}

void start();
