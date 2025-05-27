import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import VaultDetails from './pages/VaultDetails'
import HomePage from './pages/HomePage'

function App() {
  return (
      <Router>
        <div className="min-h-screen bg-gray-50">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/vault/:id" element={<VaultDetails />} />
          </Routes>
        </div>
      </Router>
  )
}

export default App
