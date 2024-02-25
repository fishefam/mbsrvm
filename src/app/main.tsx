import { select } from 'lib/dom'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import './style.scss'

createRoot(select('#root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
