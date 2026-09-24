import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Editor } from './editor/Editor'
import { Home } from './views/Home'
import { Overlay } from './views/Overlay'
import './styles.css'

const view = new URLSearchParams(window.location.search).get('view')
document.documentElement.dataset.view = view ?? 'home'

let content: ReactNode
switch (view) {
  case 'overlay':
    content = <Overlay />
    break
  case 'editor':
    content = <Editor />
    break
  default:
    content = <Home />
}

createRoot(document.getElementById('root')!).render(<StrictMode>{content}</StrictMode>)
