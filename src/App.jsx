import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useRoomCleaner } from './hooks/useRoomCleaner';
import Login from './components/Login';
import CreateRoom from './components/CreateRoom';
import RoomView from './components/RoomView';

function App() {
  const { user, loading } = useAuth();
  const [currentRoom, setCurrentRoom] = useState(null);

  // Global room cleaner - automatically deletes closed rooms
  useRoomCleaner();

  const handleRoomCreated = (roomId, gameId) => {
    setCurrentRoom(roomId);
  };

  const handleRoomJoined = (roomId) => {
    setCurrentRoom(roomId);
  };

  const handleLeaveRoom = () => {
    setCurrentRoom(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (currentRoom) {
    return <RoomView roomId={currentRoom} user={user} onLeave={handleLeaveRoom} />;
  }

  return (
    <CreateRoom
      user={user}
      onRoomCreated={handleRoomCreated}
      onRoomJoined={handleRoomJoined}
    />
  );
}

export default App;
