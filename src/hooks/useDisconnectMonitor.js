import { useEffect } from 'react';
import { ref, onValue, set, serverTimestamp } from 'firebase/database';
import { db } from '../config/firebase';

/**
 * Monitors player disconnections and automatically closes room if all players are offline
 * This ensures rooms get closed even when browsers are completely closed
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

          // If ALL members are offline, close the room immediately
          if (onlineCount === 0 && awayCount === 0 && offlineCount > 0) {
            console.log(`[DisconnectMonitor] ALL members offline! Closing room ${roomId} NOW`);

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

            // Close the room after 5 seconds
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
            }, 5000); // 5 second delay before closing
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
