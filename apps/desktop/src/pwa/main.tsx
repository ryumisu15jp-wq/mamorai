import React from 'react'
import { createRoot } from 'react-dom/client'
import { WorkerApp } from './WorkerApp.js'
import './pwa.css'

const el = document.getElementById('root')
if (el === null) throw new Error('#root が見つかりません')
createRoot(el).render(
  <React.StrictMode>
    <WorkerApp />
  </React.StrictMode>
)

// service worker 登録（インストール可能PWA）。本番(https)でのみ有効。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).catch(() => { /* 無視 */ })
  })
}
