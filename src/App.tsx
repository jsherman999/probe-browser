import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Setup from './pages/Setup';
import Game from './pages/Game';
import History from './pages/History';
import HistoryDetail from './pages/HistoryDetail';

function App() {
  return (
    <div className="min-h-screen bg-primary-bg">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/game" element={<Game />} />
        <Route path="/history" element={<History />} />
        <Route path="/history/:id" element={<HistoryDetail />} />
      </Routes>
    </div>
  );
}

export default App;
