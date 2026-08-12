import React from 'react'
import { createRoot } from 'react-dom/client'
import { EntryRouter } from './features/auth/EntryRouter.js'
import './styles.css'

const el = document.getElementById('root')
if (el === null) throw new Error('#root が見つかりません')
createRoot(el).render(
  <React.StrictMode>
    <EntryRouter />
  </React.StrictMode>
)
