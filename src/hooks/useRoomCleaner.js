import { useEffect, useRef } from 'react';
import { ref, onValue, remove, set } from 'firebase/database';
import { db } from '../config/firebase';

// Constants for room status
const ROOM_STATUS = {
  CLOSED: 'closed'
};

/**
 * Monitors all rooms and automatically deletes closed rooms after their deleteAt time
 * This ensures RTDB doesn't fill up with old room data
 *
 * OPTIMIZATION: Only ONE client acts as cleaner using leader election
 */
export function useRoomCleaner() {
  const isLeaderRef = useRef(false);
  const leaderCheckIntervalRef = useRef(null);

  useEffect(() => {
    const cleanerLeaderRef = ref(db, 'system/cleanerLeader');
    const myClientId = `client_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;

    // Try to become the leader
    const tryBecomeLeader = async () => {
      onValue(cleanerLeaderRef, async (snapshot) => {
        const currentLeader = snapshot.val();
        const now = Date.now();

        // Become leader if no leader OR leader is stale (>60s old)
        if (!currentLeader || (currentLeader.timestamp && now - currentLeader.timestamp > 60000)) {
          console.log('[RoomCleaner] Becoming cleaner leader');
          isLeaderRef.current = true;
          await set(cleanerLeaderRef, {
            clientId: myClientId,
            timestamp: now
          });
        } else if (currentLeader.clientId === myClientId) {
          isLeaderRef.current = true;
        } else {
          isLeaderRef.current = false;
          console.log('[RoomCleaner] Another client is leader, standing by');
        }
      }, { onlyOnce: true });
    };

    tryBecomeLeader();

    // Refresh leader status every 30 seconds
    leaderCheckIntervalRef.current = setInterval(async () => {
      if (isLeaderRef.current) {
        // Refresh timestamp to show we're alive
        await set(cleanerLeaderRef, {
          clientId: myClientId,
          timestamp: Date.now()
        });
      } else {
        // Check if we should become leader
        tryBecomeLeader();
      }
    }, 30000);

    const roomsRef = ref(db, 'rooms');

    // Listen to all rooms
    const unsubscribe = onValue(roomsRef, (snapshot) => {
      // OPTIMIZATION: Only leader performs cleanup
      if (!isLeaderRef.current) {
        console.log('[RoomCleaner] Not leader, skipping real-time cleanup');
        return;
      }

      if (!snapshot.exists()) return;

      const rooms = snapshot.val();
      const now = Date.now();

      // Fix async forEach anti-pattern - use Promise.all
      const deletionPromises = Object.entries(rooms).map(async ([roomId, roomData]) => {
        // Skip if room doesn't have deleteAt timestamp
        if (!roomData.deleteAt) return;

        const deleteTime = roomData.deleteAt;
        const timeUntilDeletion = deleteTime - now;

        // If it's time to delete (or past time)
        if (timeUntilDeletion <= 0) {
          console.log(`[RoomCleaner] Deleting room ${roomId} NOW (scheduled for ${new Date(deleteTime).toLocaleTimeString()})`);

          try {
            const roomRef = ref(db, `rooms/${roomId}`);
            await remove(roomRef);
            console.log(`[RoomCleaner] ✅ Room ${roomId} deleted successfully`);
          } catch (error) {
            console.error(`[RoomCleaner] ❌ Error deleting room ${roomId}:`, error);
          }
        } else {
          // Schedule deletion
          const secondsRemaining = Math.round(timeUntilDeletion / 1000);
          console.log(`[RoomCleaner] Room ${roomId} scheduled for deletion in ${secondsRemaining}s`);

          setTimeout(async () => {
            try {
              console.log(`[RoomCleaner] Deleting room ${roomId} after timeout`);
              const roomRef = ref(db, `rooms/${roomId}`);
              await remove(roomRef);
              console.log(`[RoomCleaner] ✅ Room ${roomId} deleted successfully (timeout)`);
            } catch (error) {
              console.error(`[RoomCleaner] ❌ Error deleting room ${roomId}:`, error);
            }
          }, timeUntilDeletion);
        }
      });

      // Wait for all deletion operations
      Promise.all(deletionPromises).catch(err => {
        console.error('[RoomCleaner] Error in deletion batch:', err);
      });
    });

    // Also run a periodic cleanup every 30 seconds to catch any missed deletions
    const cleanupInterval = setInterval(() => {
      // OPTIMIZATION: Only leader performs cleanup
      if (!isLeaderRef.current) {
        console.log('[RoomCleaner] Not leader, skipping periodic cleanup');
        return;
      }

      onValue(roomsRef, (snapshot) => {
        if (!snapshot.exists()) return;

        const rooms = snapshot.val();
        const now = Date.now();

        // Fix async forEach anti-pattern - use Promise.all
        const cleanupPromises = Object.entries(rooms).map(async ([roomId, roomData]) => {
          // Delete if: room is closed AND (has deleteAt in past OR has been closed for >1 minute without deleteAt)
          const isClosed = roomData.status === ROOM_STATUS.CLOSED || roomData.roomStatus === ROOM_STATUS.CLOSED;
          const hasOldDeleteTime = roomData.deleteAt && roomData.deleteAt < now;
          const closedLongAgo = roomData.closedAt && (now - roomData.closedAt > 60000); // 1 minute

          if (isClosed && (hasOldDeleteTime || closedLongAgo)) {
            console.log(`[RoomCleaner] Periodic cleanup: Deleting stale room ${roomId}`);

            try {
              const roomRef = ref(db, `rooms/${roomId}`);
              await remove(roomRef);
              console.log(`[RoomCleaner] ✅ Stale room ${roomId} deleted`);
            } catch (error) {
              console.error(`[RoomCleaner] ❌ Error deleting stale room ${roomId}:`, error);
            }
          }
        });

        // Wait for all cleanup operations
        Promise.all(cleanupPromises).catch(err => {
          console.error('[RoomCleaner] Error in periodic cleanup batch:', err);
        });
      }, { onlyOnce: true });
    }, 30000); // Every 30 seconds

    return () => {
      console.log('[RoomCleaner] Stopping room cleaner service');
      unsubscribe();
      clearInterval(cleanupInterval);
      if (leaderCheckIntervalRef.current) {
        clearInterval(leaderCheckIntervalRef.current);
      }
    };
  }, []);
}
