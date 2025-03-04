import React from 'react'
import { createRoot } from 'react-dom/client'
import { Popup } from './Popup'
import './Popup.css'

// Initialize storage manager
import { storageManager } from '../storage'
storageManager.initialize().catch(console.error)

const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>,
  )
}
