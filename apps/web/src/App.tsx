import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HomeScreen } from './screens/HomeScreen';
import { RoomRoute } from './screens/RoomRoute';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/sala/:code" element={<RoomRoute />} />
        <Route path="*" element={<HomeScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
