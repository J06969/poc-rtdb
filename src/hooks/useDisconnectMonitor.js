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

      // Wait for Firebase to propagate all disconnect handlers and status updates
      // Increased from 1s to 2s to ensure all clients' status updates have completed
      setTimeout(async () => {
        // Check if all members are offline
        onValue(roomRef, async (roomSnapshot) => {
          const roomData = roomSnapshot.val();

          // If room doesn't exist or is already closed, skip
          if (!roomData) {
            console.log(`[DisconnectMonitor] Room ${roomId} no longer exists, skipping`);
            return;
          }

          if (roomData.roomStatus === 'closed' || roomData.status === 'closed') {
            console.log(`[DisconnectMonitor] Room ${roomId} already closed, skipping`);
            return;
          }

          if (!roomData.members) {
            console.log(`[DisconnectMonitor] Room ${roomId} has no members, skipping`);
            return;
          }

          const members = roomData.members || {};
          const membersList = Object.entries(members);

          // Count member statuses
          const onlineCount = membersList.filter(([, m]) => m.status === 'online').length;
          const awayCount = membersList.filter(([, m]) => m.status === 'away').length;
          const offlineCount = membersList.filter(([, m]) => m.status === 'offline').length;

          console.log(`[DisconnectMonitor] 🔍 Room ${roomId} status check:`, {
            online: onlineCount,
            away: awayCount,
            offline: offlineCount,
            total: membersList.length,
            memberDetails: membersList.map(([id, data]) => ({
              id: id.substring(0, 8),
              name: data.name,
              status: data.status,
              role: data.role
            }))
          });

          // CRITICAL: Room closes ONLY if there are ZERO online players AND ZERO away players
          // If even ONE player is online or away, the room MUST stay open
          const hasActivePlayers = onlineCount > 0 || awayCount > 0;

          if (hasActivePlayers) {
            console.log(`[DisconnectMonitor] ✅ Room ${roomId} has ${onlineCount} online + ${awayCount} away players. Room stays OPEN.`);
            return; // Exit early - DO NOT close the room
          }

          // If we get here, ALL members are offline
          if (onlineCount === 0 && awayCount === 0 && offlineCount > 0) {
            console.log(`[DisconnectMonitor] ❌ ALL ${offlineCount} members offline! Room ${roomId} will close in ${ROOM_MONITOR_CONFIG.EMPTY_AUTO_CLOSE_TIMEOUT / 1000}s`);

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
              // DOUBLE CHECK: Before closing, verify again that no one is online
              // This prevents race conditions where someone reconnects during the timeout
              onValue(roomRef, async (finalCheckSnapshot) => {
                const finalRoomData = finalCheckSnapshot.val();

                if (!finalRoomData || !finalRoomData.members) {
                  console.log(`[DisconnectMonitor] Room ${roomId} disappeared before closure`);
                  return;
                }

                const finalMembers = finalRoomData.members || {};
                const finalMembersList = Object.entries(finalMembers);
                const finalOnlineCount = finalMembersList.filter(([, m]) => m.status === 'online').length;
                const finalAwayCount = finalMembersList.filter(([, m]) => m.status === 'away').length;

                if (finalOnlineCount > 0 || finalAwayCount > 0) {
                  console.log(`[DisconnectMonitor] 🛑 ABORT CLOSURE: Room ${roomId} has ${finalOnlineCount} online + ${finalAwayCount} away players. NOT closing!`);
                  return; // DO NOT close - someone is still there!
                }

                console.log(`[DisconnectMonitor] ✅ Confirmed: ALL players still offline. Closing room ${roomId}`);

                const roomStatusRef = ref(db, `rooms/${roomId}/roomStatus`);
                const closedAtRef = ref(db, `rooms/${roomId}/closedAt`);
                const closeReasonRef = ref(db, `rooms/${roomId}/closeReason`);

                await set(statusRef, 'closed');
                await set(roomStatusRef, 'closed');
                await set(closedAtRef, serverTimestamp());
                await set(closeReasonRef, 'Auto-closed: All players disconnected');

                console.log(`[DisconnectMonitor] Room ${roomId} closed successfully`);
              }, { onlyOnce: true });
            }, ROOM_MONITOR_CONFIG.EMPTY_AUTO_CLOSE_TIMEOUT);
          } else {
            console.log(`[DisconnectMonitor] ⚠️ Unexpected state: Room ${roomId} has no offline players but also no online/away? Total members: ${membersList.length}`);
          }
        }, { onlyOnce: true });
      }, 2000); // Wait 2 seconds for all disconnect handlers to complete
    });

    return () => {
      console.log(`[DisconnectMonitor] Cleanup for room ${roomId}`);
      unsubscribe();
    };
  }, [roomId]);
}
