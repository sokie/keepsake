import { NavLink, Route, Routes, Link } from 'react-router-dom'
import GalleryPage from './pages/GalleryPage'
import ArchivePage from './pages/ArchivePage'
import ImportPage from './pages/ImportPage'
import ChatPage from './pages/ChatPage'
import MemoryPage from './pages/MemoryPage'

export default function App() {
  return (
    <>
      <header className="shell-header">
        <Link to="/" className="wordmark">
          Keepsake<em>.</em>
        </Link>
        <span className="tagline">conversations worth keeping</span>
        <nav className="shell-nav">
          <NavLink to="/" end>
            Memories
          </NavLink>
          <NavLink to="/archive">Archive</NavLink>
          <NavLink to="/import">Import</NavLink>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<GalleryPage />} />
        <Route path="/archive" element={<ArchivePage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/chat/:chatId" element={<ChatPage />} />
        <Route path="/memory/:memoryId" element={<MemoryPage />} />
      </Routes>
    </>
  )
}
