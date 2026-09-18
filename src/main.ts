import { mount } from 'svelte';
import './styles/global.css';
import App from './App.svelte';
import { initServiceWorker } from './lib/stores/sw.svelte.js';

initServiceWorker();

const app = mount(App, {
  target: document.getElementById('app')!
});

export default app;
