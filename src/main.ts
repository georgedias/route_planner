import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import 'maplibre-gl/dist/maplibre-gl.css'
import './style.css'
createApp(App).use(createPinia()).mount('#app')
