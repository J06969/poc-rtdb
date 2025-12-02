import { useEffect } from 'react';
import { ref, onValue, set, serverTimestamp } from 'firebase/database';
import { db } from '../config/firebase';
import { ROOM_MONITOR_CONFIG } from '../config/roomMonitor';

/**
 * Monitors player disconnections and automatically closes room if ALL players are offline
 *
 * CRITICAL BEHAVIOR:
 * - Room ONLY closes when ALL players are offline (no online, no away)
 * - If ANY player is online or away, room stays open
 * - When host leaves but other players exist, host is transferred (via useHostTransfer hook)
 * - Empty rooms close after 3 seconds (configurable in ROOM_MONITOR_CONFIG)
 *
 * This ensures:
 * 1. Host can leave, transfer role to another player, room continues
 * 2. Rooms only close when truly abandoned (all offline)
 * 3. Works even when browsers are completely closed (Firebase disconnect handlers)
 *
 * @param {string} roomId - The room ID to monitor
 */
export function useDisconnectMonitor(roomId) {
  useEffect(() => {
    if (!roomId) return;

    console.log(`[DisconnectMonitor] Starting disconnect monitor for room ${roomId}`);

    const disconnectTriggerRef = ref(db, `rooms/${roomId}/lastDisconnectAt`);
    const roomRef = ref(db, `rooms/${roomId}`);

    // Listen for disconnect events
    const unsubscribe = onValue(disconnectTriggerRef, async (snapshot) => {
      if (!snapshot.exists()) return;

      const lastDisconnect = snapshot.val();
      console.log(`[DisconnectMonitor] Disconnect detected in room ${roomId} at ${lastDisconnect}`);

      // Wait a moment for Firebase to update all member statuses
      setTimeout(async () => {
        // Check if all members are offline
        onValue(roomRef, async (roomSnapshot) => {
          const roomData = roomSnapshot.val();
          if (!roomData || !roomData.members) return;

          const members = roomData.members || {};
          const membersList = Object.entries(members);

          // Count member statuses
          const onlineCount = membersList.filter(([, m]) => m.status === 'online').length;
          const awayCount = membersList.filter(([, m]) => m.status === 'away').length;
          const offlineCount = membersList.filter(([, m]) => m.status === 'offline').length;

          console.log(`[DisconnectMonitor] Room ${roomId} member count:`, {
            online: onlineCount,
            away: awayCount,
            offline: offlineCount,
            total: membersList.length
          });

          // If ALL members are offline, close the room after a short delay
          if (onlineCount === 0 && awayCount === 0 && offlineCount > 0) {
            console.log(`[DisconnectMonitor] ALL ${offlineCount} members offline! Room ${roomId} will close in ${ROOM_MONITOR_CONFIG.EMPTY_AUTO_CLOSE_TIMEOUT / 1000}s`);

            // Set room to empty status
            const statusRef = ref(db, `rooms/${roomId}/status`);
            const inactiveSinceRef = ref(db, `rooms/${roomId}/inactiveSince`);

            await set(statusRef, 'empty');
            await set(inactiveSinceRef, Date.now());

            // Update stats
            const statsRef = ref(db, `rooms/${roomId}/stats`);
            await set(statsRef, {
              activePlayers: 0,
              awayPlayers: 0,
              offlinePlayers: offlineCount,
              totalPlayers: membersList.length,
              lastChecked: serverTimestamp()
            });

            // Close the room after configured timeout (3 seconds)
            setTimeout(async () => {
              console.log(`[DisconnectMonitor] Auto-closing empty room ${roomId}`);

              const roomStatusRef = ref(db, `rooms/${roomId}/roomStatus`);
              const closedAtRef = ref(db, `rooms/${roomId}/closedAt`);
              const closeReasonRef = ref(db, `rooms/${roomId}/closeReason`);

              await set(statusRef, 'closed');
              await set(roomStatusRef, 'closed');
              await set(closedAtRef, serverTimestamp());
              await set(closeReasonRef, 'Auto-closed: All players disconnected');

              console.log(`[DisconnectMonitor] Room ${roomId} closed successfully`);
            }, ROOM_MONITOR_CONFIG.EMPTY_AUTO_CLOSE_TIMEOUT);
          } else {
            console.log(`[DisconnectMonitor] Room ${roomId} still has active/away members, not closing`);
          }
        }, { onlyOnce: true });
      }, 1000); // Wait 1 second for all disconnect handlers to complete
    });

    return () => {
      console.log(`[DisconnectMonitor] Cleanup for room ${roomId}`);
      unsubscribe();
    };
  }, [roomId]);
}
