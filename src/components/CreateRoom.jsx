import { useState, useEffect } from 'react';
import { createGameRoom, joinRoom, subscribeToAllRooms } from '../services/room';
import { signOut } from '../services/auth';
import { useConnectionStatus } from '../hooks/useConnectionStatus';
import { PRESENCE_CONFIG } from '../config/presence';
import { AFK_CONFIG } from '../config/afk';

export default function CreateRoom({ user, onRoomCreated, onRoomJoined }) {
  const [loading, setLoading] = useState(false);
  const [roomIdInput, setRoomIdInput] = useState('');
  const [error, setError] = useState('');
  const [activeRooms, setActiveRooms] = useState([]);
  const { isConnected, lastPing } = useConnectionStatus();

  useEffect(() => {
    // Subscribe to all active rooms
    const unsubscribe = subscribeToAllRooms((rooms) => {
      setActiveRooms(rooms);
    });

    return () => unsubscribe();
  }, []);

  const handleCreateRoom = async () => {
    setLoading(true);
    setError('');
    try {
      const { roomId, gameId } = await createGameRoom(user.uid);
      onRoomCreated(roomId, gameId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!roomIdInput.trim()) return;

    setLoading(true);
    setError('');
    try {
      await joinRoom(roomIdInput.toUpperCase(), user.uid);
      onRoomJoined(roomIdInput.toUpperCase());
    } catch (err) {
      setError(err.message || 'Failed to join room. Make sure the room ID is correct.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Game Lobby</h1>
            <p className="text-sm text-gray-600">User: {user.uid.substring(0, 8)}...</p>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Sign Out
          </button>
        </div>

        {/* Connection Status Indicator */}
        <div className={`mb-4 p-3 rounded-lg border-2 ${
          isConnected
            ? 'bg-green-50 border-green-300'
            : 'bg-red-50 border-red-300'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
              }`}></div>
              <span className={`font-semibold text-sm ${
                isConnected ? 'text-green-700' : 'text-red-700'
              }`}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            {isConnected && lastPing && (
              <span className="text-xs text-green-600">
                Last ping: {lastPing.toLocaleTimeString()}
              </span>
            )}
          </div>
          {!isConnected && (
            <p className="text-xs text-red-600 mt-1">
              Check your internet connection. You cannot create or join rooms while offline.
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={handleCreateRoom}
            disabled={loading || !isConnected}
            className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-4 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create New Room'}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or</span>
            </div>
          </div>

          <form onSubmit={handleJoinRoom} className="space-y-3">
            <input
              type="text"
              placeholder="Enter Room ID (e.g., XY7Z9A)"
              value={roomIdInput}
              onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
              maxLength={6}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg font-mono tracking-wider"
            />
            <button
              type="submit"
              disabled={loading || !roomIdInput.trim() || !isConnected}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Join Room
            </button>
          </form>
        </div>

        {/* Active Rooms List */}
        {activeRooms.length > 0 && (
          <div className="mt-8">
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center justify-between">
              <span>Active Rooms ({activeRooms.length})</span>
              <span className="text-xs text-gray-500 font-normal">Click to join</span>
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {activeRooms.map((room) => {
                const members = room.members || {};
                const membersList = Object.entries(members);
                const onlineCount = membersList.filter(([, m]) => m.status === 'online').length;
                const awayCount = membersList.filter(([, m]) => m.status === 'away').length;

                return (
                  <div
                    key={room.roomId}
                    onClick={() => {
                      setRoomIdInput(room.roomId);
                    }}
                    className="p-3 border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <code className="font-mono font-bold text-sm text-gray-800">
                            {room.roomId}
                          </code>
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                            {room.roomStatus || 'open'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                          <span>👥 {membersList.length} member{membersList.length !== 1 ? 's' : ''}</span>
                          <span className="text-green-600">✓ {onlineCount} online</span>
                          {awayCount > 0 && (
                            <span className="text-yellow-600">⏸ {awayCount} away</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500 space-y-1">
                          {membersList.slice(0, 3).map(([memberId, memberData]) => {
                            const status = memberData.status || 'offline';
                            const dotColor = status === 'online' ? 'bg-green-500' :
                                           status === 'away' ? 'bg-yellow-500' : 'bg-gray-400';

                            return (
                              <div key={memberId} className="flex items-center gap-1 justify-end">
                                <div className={`w-2 h-2 rounded-full ${dotColor}`}></div>
                                <span className="truncate max-w-[100px]">{memberData.name}</span>
                                {memberData.latency && (status === 'online' || status === 'away') && (
                                  <span className={`ml-1 ${
                                    memberData.latency < 100 ? 'text-green-600' :
                                    memberData.latency < 200 ? 'text-yellow-600' : 'text-red-600'
                                  }`}>
                                    ({memberData.latency}ms)
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          {membersList.length > 3 && (
                            <div className="text-gray-400">+{membersList.length - 3} more</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-8 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-gray-700 mb-2">How to Test:</h3>
          <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
            <li>Create a new room</li>
            <li>Open this app in another browser/tab</li>
            <li>Join the room using the Room ID</li>
            <li>Disconnect one user's internet</li>
            <li>Watch the status indicator update in real-time</li>
          </ol>
        </div>

        {/* Configuration Info */}
        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="text-xs font-semibold text-gray-700 mb-2">⚙️ Current Configuration:</h3>

          {/* Latency Config */}
          <div className="text-xs text-gray-600 space-y-1 mb-3">
            <div className="font-semibold text-gray-700 mb-1">Latency Tracking:</div>
            <div className="flex justify-between pl-2">
              <span>Enabled:</span>
              <span className="font-medium">
                {PRESENCE_CONFIG.ENABLE_LATENCY_TRACKING ? '✓ Yes' : '✗ No'}
              </span>
            </div>
            {PRESENCE_CONFIG.ENABLE_LATENCY_TRACKING && (
              <>
                <div className="flex justify-between pl-2">
                  <span>Ping Interval:</span>
                  <span className="font-medium">{PRESENCE_CONFIG.PING_INTERVAL / 1000}s</span>
                </div>
                <div className="flex justify-between pl-2">
                  <span>Ping Only When Active:</span>
                  <span className="font-medium">
                    {PRESENCE_CONFIG.PING_ONLY_WHEN_ACTIVE ? '✓ Yes' : '✗ No'}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* AFK Check Config */}
          <div className="text-xs text-gray-600 space-y-1 border-t border-gray-300 pt-2">
            <div className="font-semibold text-gray-700 mb-1">AFK Check (Host):</div>
            <div className="flex justify-between pl-2">
              <span>Enabled:</span>
              <span className="font-medium">
                {AFK_CONFIG.ENABLED ? '✓ Yes' : '✗ No'}
              </span>
            </div>
            {AFK_CONFIG.ENABLED && (
              <>
                <div className="flex justify-between pl-2">
                  <span>Check After:</span>
                  <span className="font-medium">{AFK_CONFIG.CHECK_INTERVAL / 60000} min</span>
                </div>
                <div className="flex justify-between pl-2">
                  <span>Response Timeout:</span>
                  <span className="font-medium">{AFK_CONFIG.RESPONSE_TIMEOUT}s</span>
                </div>
              </>
            )}
          </div>

          <div className="mt-2 pt-2 border-t border-gray-300">
            <p className="text-xs text-gray-500">
              💡 Edit <code className="bg-gray-200 px-1 rounded">src/config/*.js</code> to adjust settings
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
