import { useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../config/firebase';
import { ROOM_MONITOR_CONFIG } from '../config/roomMonitor';
import { closeRoom } from '../services/room';

// Constants for room status
const ROOM_STATUS = {
  ACTIVE: 'active',
  IDLE: 'idle',
  EMPTY: 'empty',
  CLOSED: 'closed',
  OPEN: 'open'
};

/**
 * Custom hook to monitor room status and auto-cleanup
 * Now runs on ALL users to ensure monitoring continues even if host leaves
 *
 * @param {string} roomId - The room ID to monitor
 * @param {string} userId - The current user ID
 * @param {boolean} isHost - Whether current user is host (for logging purposes)
 * @returns {Object} Room monitoring status
 */
export function useRoomMonitor(roomId, userId, isHost) {
  useEffect(() => {
    if (!roomId || !ROOM_MONITOR_CONFIG.ENABLED) return;

    const roomRef = ref(db, `rooms/${roomId}`);
    let idleTimer = null;

    const checkRoomActivity = async (roomData) => {
      if (!roomData) return;

      // Skip if room is already closed
      if (roomData.status === ROOM_STATUS.CLOSED || roomData.roomStatus === ROOM_STATUS.CLOSED) {
        return;
      }

      // SIMPLIFIED: This hook now ONLY handles auto-close logic
      // useRoomStatusUpdater handles all status/stats updates to avoid duplicate writes

      // Auto-close logic - use timestamp from database
      if (ROOM_MONITOR_CONFIG.AUTO_CLOSE_ENABLED && roomData.inactiveSince) {
        const timeSinceInactive = Date.now() - roomData.inactiveSince;
        const currentStatus = roomData.status;

        // Choose timeout based on room status
        // EMPTY = all players offline → close fast (5 seconds)
        // IDLE = all players away → close slow (5 minutes)
        const timeout = currentStatus === ROOM_STATUS.EMPTY
          ? ROOM_MONITOR_CONFIG.EMPTY_AUTO_CLOSE_TIMEOUT
          : ROOM_MONITOR_CONFIG.IDLE_AUTO_CLOSE_TIMEOUT;

        // If room has been inactive for too long, close it
        if (timeout && timeSinceInactive > timeout) {
          const timeInSeconds = Math.round(timeSinceInactive / 1000);
          const reason = currentStatus === ROOM_STATUS.EMPTY
            ? `Auto-closed: Room empty for ${timeInSeconds}s`
            : `Auto-closed: Room idle for ${Math.round(timeInSeconds / 60)}m`;

          console.log(`[RoomMonitor] ${reason}`);
          closeRoom(roomId, reason);
        } else {
          // Log time remaining (reduce spam with random check)
          if (Math.random() < 0.1) { // 10% chance
            const timeRemaining = timeout - timeSinceInactive;
            const mins = Math.floor(timeRemaining / 1000 / 60);
            const secs = Math.floor((timeRemaining / 1000) % 60);

            if (currentStatus === ROOM_STATUS.EMPTY) {
              console.log(`[RoomMonitor] Room ${roomId} EMPTY - closes in ${secs}s`);
            } else {
              console.log(`[RoomMonitor] Room ${roomId} IDLE - closes in ${mins}m ${secs}s`);
            }
          }
        }
      }
    };

    // Subscribe to room changes
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const roomData = snapshot.val();
      if (roomData) {
        checkRoomActivity(roomData);
      }
    });

    // Periodic check for auto-close
    // Check every 3 seconds to catch the 5-second empty timeout quickly
    const checkInterval = setInterval(() => {
      onValue(roomRef, (snapshot) => {
        const roomData = snapshot.val();
        if (roomData) {
          checkRoomActivity(roomData);
        }
      }, { onlyOnce: true });
    }, 3000); // Check every 3 seconds to catch fast empty timeout

    return () => {
      unsubscribe();
      if (checkInterval) clearInterval(checkInterval);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [roomId, userId, isHost]);

  return {};
}
