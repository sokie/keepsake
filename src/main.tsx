import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/fraunces/wght-italic.css'
import '@fontsource-variable/newsreader'
import '@fontsource-variable/newsreader/wght-italic.css'
import './styles.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
