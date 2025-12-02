import { useState, useEffect } from 'react';
import { subscribeToRoom, leaveRoom, closeRoom } from '../services/room';
import { usePresence } from '../hooks/usePresence';
import { useRoomMonitor } from '../hooks/useRoomMonitor';
import { useRoomStatusUpdater } from '../hooks/useRoomStatusUpdater';
import { useDisconnectMonitor } from '../hooks/useDisconnectMonitor';
import AfkCheckModal from './AfkCheckModal';
import { AFK_CONFIG } from '../config/afk';

export default function RoomView({ roomId, user, onLeave }) {
  const [roomData, setRoomData] = useState(null);
  const { isConnected, latency } = usePresence(roomId, user.uid);
  const [showAfkModal, setShowAfkModal] = useState(false);
  const [afkCheckDismissed, setAfkCheckDismissed] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [timeUntilAutoClose, setTimeUntilAutoClose] = useState(null);

  // Enable room monitoring for host (handles auto-close timing)
  useRoomMonitor(roomId, user.uid, isHost);

  // Enable automatic room status updates for ALL users
  // This ensures room status updates even when host is offline
  useRoomStatusUpdater(roomId);

  // CRITICAL: Monitor disconnections and auto-close if all players offline
  // This works even when browsers are completely closed!
  useDisconnectMonitor(roomId);

  // Calculate time until auto-close
  useEffect(() => {
    if (!roomData || !roomData.inactiveSince) {
      setTimeUntilAutoClose(null);
      return;
    }

    const updateTimer = () => {
      const inactiveSince = roomData.inactiveSince;
      const currentStatus = roomData.status;

      // Different timeouts for empty vs idle
      const AUTO_CLOSE_TIMEOUT = currentStatus === 'empty'
        ? 5 * 1000  // 5 seconds for empty rooms
        : 5 * 60 * 1000; // 5 minutes for idle rooms

      const timeSinceInactive = Date.now() - inactiveSince;
      const remaining = AUTO_CLOSE_TIMEOUT - timeSinceInactive;

      if (remaining > 0) {
        setTimeUntilAutoClose(remaining);
      } else {
        setTimeUntilAutoClose(0);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100); // Update every 100ms for smooth countdown

    return () => clearInterval(interval);
  }, [roomData?.inactiveSince, roomData?.status]);

  useEffect(() => {
    // Subscribe to room updates
    const unsubscribe = subscribeToRoom(roomId, (data) => {
      setRoomData(data);

      // Check if current user is host
      if (data && data.members && data.members[user.uid]) {
        const currentMember = data.members[user.uid];
        setIsHost(currentMember.role === 'host');
      }

      // Check if room was closed
      if (data && (data.roomStatus === 'closed' || data.status === 'closed')) {
        const reason = data.closeReason || 'This room has been closed.';
        alert(reason);
        onLeave();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [roomId, user.uid, onLeave]);

  // AFK Check Timer (for host only)
  useEffect(() => {
    if (!roomData || !AFK_CONFIG.ENABLED || afkCheckDismissed) return;

    // Check if current user is the host
    const members = roomData.members || {};
    const currentMember = members[user.uid];
    const isHost = currentMember?.role === 'host';

    if (!isHost) return;

    // Set timer for AFK check
    const afkTimer = setTimeout(() => {
      setShowAfkModal(true);
    }, AFK_CONFIG.CHECK_INTERVAL);

    return () => clearTimeout(afkTimer);
  }, [roomData, user.uid, afkCheckDismissed]);

  const handleLeave = async () => {
    try {
      await leaveRoom(roomId, user.uid);
      onLeave();
    } catch (err) {
      console.error('Error leaving room:', err);
      onLeave(); // Leave anyway
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    alert('Room ID copied to clipboard!');
  };

  const handleAfkConfirm = () => {
    setShowAfkModal(false);
    setAfkCheckDismissed(true);
    console.log('Host confirmed presence - AFK check dismissed');
  };

  const handleAfkTimeout = async () => {
    console.log('AFK timeout - closing room');
    setShowAfkModal(false);
    try {
      await closeRoom(roomId);
      alert('Room closed due to host inactivity.');
      onLeave();
    } catch (err) {
      console.error('Error closing room:', err);
      onLeave();
    }
  };

  if (!roomData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
        <div className="text-white text-xl">Loading room...</div>
      </div>
    );
  }

  const members = roomData.members || {};
  const membersList = Object.entries(members);

  // Format time until auto-close
  const formatTimeRemaining = (ms) => {
    const minutes = Math.floor(ms / 1000 / 60);
    const seconds = Math.floor((ms / 1000) % 60);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Auto-close warning banner */}
        {timeUntilAutoClose !== null && (roomData.status === 'empty' || roomData.status === 'idle') && (
          <div className={`${roomData.status === 'empty' ? 'bg-red-600' : 'bg-orange-500'} text-white rounded-lg shadow-xl p-4 mb-4 animate-pulse`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <div className="font-bold text-lg">
                    {roomData.status === 'empty' ? '⚠️ Room Empty - Closing Fast!' : 'Room Idle - Auto-closing soon'}
                  </div>
                  <div className="text-sm">
                    {roomData.status === 'empty' ? (
                      <>All players offline. Room closes in: <span className="font-mono font-bold text-xl">{formatTimeRemaining(timeUntilAutoClose)}</span></>
                    ) : (
                      <>All players away. Room closes in: <span className="font-mono font-bold">{formatTimeRemaining(timeUntilAutoClose)}</span></>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-xl p-6 mb-4">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Game Room</h1>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-gray-600">Room ID:</span>
                <code className="bg-gray-100 px-3 py-1 rounded font-mono text-lg font-bold">
                  {roomId}
                </code>
                <button
                  onClick={copyRoomId}
                  className="text-blue-500 hover:text-blue-600 text-sm underline"
                >
                  Copy
                </button>
              </div>
            </div>
            <button
              onClick={handleLeave}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition duration-200"
            >
              Leave Room
            </button>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-gray-600">
                Your connection: {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            {latency !== null && (
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Ping:</span>
                <span className={`font-semibold ${
                  latency < 100 ? 'text-green-600' : latency < 200 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {latency}ms
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800">
              Members ({membersList.length})
            </h2>
            <div className="flex items-center gap-3">
              <div className="text-sm">
                <span className="text-gray-600">Room: </span>
                <span className={`font-semibold ${
                  roomData.roomStatus === 'closed' ? 'text-red-600' :
                  roomData.roomStatus === 'open' ? 'text-green-600' : 'text-gray-600'
                }`}>
                  {roomData.roomStatus || 'open'}
                </span>
              </div>
              <div className="text-sm">
                <span className="text-gray-600">Status: </span>
                <span className={`font-semibold ${
                  roomData.status === 'active' ? 'text-green-600' :
                  roomData.status === 'idle' ? 'text-yellow-600' :
                  roomData.status === 'empty' ? 'text-orange-600' :
                  roomData.status === 'closed' ? 'text-red-600' : 'text-gray-600'
                }`}>
                  {roomData.status || 'active'}
                </span>
              </div>
            </div>
          </div>

          {/* Player Statistics */}
          {roomData.stats && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="text-sm font-semibold text-gray-700 mb-2">Player Activity:</div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {roomData.stats.activePlayers || 0}
                  </div>
                  <div className="text-xs text-gray-600">Online</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-600">
                    {roomData.stats.awayPlayers || 0}
                  </div>
                  <div className="text-xs text-gray-600">Away</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">
                    {roomData.stats.offlinePlayers || 0}
                  </div>
                  <div className="text-xs text-gray-600">Offline</div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {membersList.map(([memberId, memberData]) => {
              const status = memberData.status || 'offline';
              const isOnline = status === 'online';
              const isAway = status === 'away';
              const isOffline = status === 'offline';
              const isCurrentUser = memberId === user.uid;
              const isHost = memberData.role === 'host';
              const memberLatency = memberData.latency;

              // Status colors and labels
              const statusConfig = {
                online: { dot: 'bg-green-500', text: 'text-green-600', label: 'ONLINE' },
                away: { dot: 'bg-yellow-500', text: 'text-yellow-600', label: 'AWAY' },
                offline: { dot: 'bg-red-500', text: 'text-red-600', label: 'OFFLINE' }
              };
              const currentStatus = statusConfig[status] || statusConfig.offline;

              return (
                <div
                  key={memberId}
                  className={`p-4 rounded-lg border-2 ${
                    isCurrentUser ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-4 h-4 rounded-full ${currentStatus.dot} ${
                          isOnline || isAway ? 'animate-pulse' : ''
                        }`}
                      ></div>
                      <div>
                        <div className="font-semibold text-gray-800">
                          {memberData.name}
                          {isCurrentUser && (
                            <span className="ml-2 text-sm text-blue-600">(You)</span>
                          )}
                          {isHost && (
                            <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                              HOST
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">
                          ID: {memberId.substring(0, 8)}...
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-semibold ${currentStatus.text}`}>
                        {currentStatus.label}
                      </div>
                      {(isOnline || isAway) && memberLatency !== undefined && memberLatency !== null && (
                        <div className="text-sm mt-1">
                          <span className={`font-medium ${
                            memberLatency < 100 ? 'text-green-600' :
                            memberLatency < 200 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {memberLatency}ms
                          </span>
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        {memberData.role || 'player'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-6 mt-4">
          <h3 className="font-bold text-yellow-800 mb-2">POC Verification Steps:</h3>
          <ol className="text-sm text-yellow-700 space-y-2 list-decimal list-inside">
            <li>Share the Room ID with another browser/device</li>
            <li>Have the other user join this room</li>
            <li><strong>Switch to another tab:</strong> Status turns YELLOW "AWAY" instantly</li>
            <li><strong>Return to tab:</strong> Status turns GREEN "ONLINE" automatically</li>
            <li><strong>Turn off WiFi:</strong> Status turns RED "OFFLINE" within 2-5 seconds</li>
            <li>Reconnect internet - status should turn GREEN "ONLINE" again</li>
            <li><strong>All players away (tabs hidden):</strong> Room status → "idle", closes after <strong>5 minutes</strong></li>
            <li><strong>All players offline (browsers closed):</strong> Room status → "empty", closes after <strong>5 seconds</strong> ⚡</li>
          </ol>
          <p className="mt-3 text-xs text-yellow-600">
            This demonstrates Firebase RTDB's built-in presence system using .info/connected
            and onDisconnect() primitives, plus Page Visibility API for tab switching. No manual polling required!
          </p>
        </div>

        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mt-4">
          <h3 className="font-bold text-blue-800 mb-2 text-sm">Room Status Legend:</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="font-semibold text-green-600">Active:</span> Players are online and active</div>
            <div><span className="font-semibold text-yellow-600">Idle:</span> All players away (closes in 5min)</div>
            <div><span className="font-semibold text-orange-600">Empty:</span> All players offline (closes in 5sec) ⚡</div>
            <div><span className="font-semibold text-red-600">Closed:</span> Room has been terminated</div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 mt-4">
          <h3 className="text-white font-semibold mb-2 text-sm">Debug Info:</h3>
          <pre className="text-xs text-gray-300 overflow-auto">
            {JSON.stringify(
              {
                gameId: roomData.gameId,
                totalMembers: roomData.totalMembers,
                onlineMemberCount: roomData.onlineMemberCount,
                status: roomData.status,
                roomStatus: roomData.roomStatus,
                stats: roomData.stats,
                isHost: isHost,
                closeReason: roomData.closeReason,
                inactiveSince: roomData.inactiveSince,
                lastActiveAt: roomData.lastActiveAt,
                timeUntilAutoClose: timeUntilAutoClose ? formatTimeRemaining(timeUntilAutoClose) : null,
              },
              null,
              2
            )}
          </pre>
        </div>
      </div>

      {/* AFK Check Modal (Host Only) */}
      {showAfkModal && (
        <AfkCheckModal
          countdown={AFK_CONFIG.RESPONSE_TIMEOUT}
          onConfirm={handleAfkConfirm}
          onTimeout={handleAfkTimeout}
        />
      )}
    </div>
  );
}
