import { useEffect, useRef } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../config/firebase';
import { updateRoomStatus } from '../services/room';

// Constants for member status
const MEMBER_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline'
};

/**
 * Hook that automatically updates room status when ANY player status changes
 * This ensures room status is updated even when host is offline
 *
 * @param {string} roomId - The room ID to monitor
 */
export function useRoomStatusUpdater(roomId) {
  const debounceTimerRef = useRef(null);
  const updateCountRef = useRef(0);
  const lastUpdateTimeRef = useRef(0);

  useEffect(() => {
    if (!roomId) return;

    const roomMembersRef = ref(db, `rooms/${roomId}/members`);

    console.log(`[RoomStatusUpdater] Starting to monitor room ${roomId}`);

    // Perform initial status update immediately
    const initialUpdateTimer = setTimeout(async () => {
      try {
        console.log(`[RoomStatusUpdater] Performing initial status check for room ${roomId}`);
        await updateRoomStatus(roomId);
        lastUpdateTimeRef.current = Date.now();
      } catch (error) {
        console.error(`[RoomStatusUpdater] Error in initial status update:`, error);
      }
    }, 500); // Reduced from 2s to 500ms

    // Listen to any changes in member statuses
    const unsubscribe = onValue(roomMembersRef, (snapshot) => {
      if (!snapshot.exists()) {
        console.log(`[RoomStatusUpdater] No members found for room ${roomId}`);
        return;
      }

      updateCountRef.current += 1;
      const updateNum = updateCountRef.current;

      console.log(`[RoomStatusUpdater] #${updateNum} Member data received for room ${roomId}`);

      const members = snapshot.val();
      const memberStatuses = Object.entries(members).map(([id, data]) => ({
        id: id.substring(0, 8),
        status: data.status
      }));
      console.log(`[RoomStatusUpdater] #${updateNum} Current members:`, memberStatuses);

      // Check if this is a critical change (player going offline/online)
      const hasOfflinePlayers = memberStatuses.some(m => m.status === MEMBER_STATUS.OFFLINE);
      const allPlayersOffline = memberStatuses.every(m => m.status === MEMBER_STATUS.OFFLINE);
      const isCriticalChange = hasOfflinePlayers || allPlayersOffline;

      // Clear previous timeout
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        console.log(`[RoomStatusUpdater] #${updateNum} Cleared previous debounce timer`);
      }

      // Debounce to avoid too many updates
      const executeUpdate = async () => {
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdateTimeRef.current;

        try {
          console.log(`[RoomStatusUpdater] #${updateNum} Executing room status update for ${roomId} (${timeSinceLastUpdate}ms since last update)`);
          await updateRoomStatus(roomId);
          lastUpdateTimeRef.current = now;
          console.log(`[RoomStatusUpdater] #${updateNum} Successfully updated room status for ${roomId}`);
        } catch (error) {
          console.error(`[RoomStatusUpdater] #${updateNum} Error updating room status for ${roomId}:`, error);
        }
      };

      // If critical change, execute faster
      const debounceTime = isCriticalChange ? 200 : 500;
      console.log(`[RoomStatusUpdater] #${updateNum} Setting ${debounceTime}ms debounce (critical: ${isCriticalChange})`);
      debounceTimerRef.current = setTimeout(executeUpdate, debounceTime);
    });

    // Fallback: Periodic status check to ensure stats are always current
    // This ensures status is updated even if onValue doesn't fire
    const periodicCheckInterval = setInterval(async () => {
      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdateTimeRef.current;

      // Only update if we haven't updated in the last 3 seconds
      if (timeSinceLastUpdate > 3000) {
        try {
          console.log(`[RoomStatusUpdater] Periodic fallback check for room ${roomId}`);
          await updateRoomStatus(roomId);
          lastUpdateTimeRef.current = now;
        } catch (error) {
          console.error(`[RoomStatusUpdater] Error in periodic check:`, error);
        }
      }
    }, 5000); // Every 5 seconds to catch issues quickly

    return () => {
      console.log(`[RoomStatusUpdater] Cleanup for room ${roomId}`);
      unsubscribe();
      if (initialUpdateTimer) {
        clearTimeout(initialUpdateTimer);
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (periodicCheckInterval) {
        clearInterval(periodicCheckInterval);
      }
    };
  }, [roomId]);

  return {};
}
