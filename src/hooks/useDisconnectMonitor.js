import { useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../config/firebase';
import { ROOM_MONITOR_CONFIG } from '../config/roomMonitor';

// Constants for room and member status
const ROOM_STATUS = {
  ACTIVE: 'active',
  IDLE: 'idle',
  EMPTY: 'empty',
  CLOSED: 'closed',
  OPEN: 'open'
};

const MEMBER_STATUS = {
  ONLINE: 'online',
  AWAY: 'away',
  OFFLINE: 'offline'
};

// Helper to batch update multiple paths
const batchUpdate = async (updates) => {
  const promises = Object.entries(updates).map(([path, value]) => {
    const reference = ref(db, path);
    // Import set here to avoid circular dependency
    const { set, serverTimestamp: st } = require('firebase/database');
    // Replace serverTimestamp placeholder with actual call
    const actualValue = value === 'SERVER_TIMESTAMP' ? st() : value;
    return set(reference, actualValue);
  });
  return Promise.all(promises);
};

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

          if (roomData.roomStatus === ROOM_STATUS.CLOSED || roomData.status === ROOM_STATUS.CLOSED) {
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
          const onlineCount = membersList.filter(([, m]) => m.status === MEMBER_STATUS.ONLINE).length;
          const awayCount = membersList.filter(([, m]) => m.status === MEMBER_STATUS.AWAY).length;
          const offlineCount = membersList.filter(([, m]) => m.status === MEMBER_STATUS.OFFLINE).length;

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

            // Batch update room to empty status
            const updates = {
              [`rooms/${roomId}/status`]: ROOM_STATUS.EMPTY,
              [`rooms/${roomId}/inactiveSince`]: Date.now(),
              [`rooms/${roomId}/stats`]: {
                activePlayers: 0,
                awayPlayers: 0,
                offlinePlayers: offlineCount,
                totalPlayers: membersList.length,
                lastChecked: 'SERVER_TIMESTAMP'
              }
            };

            await batchUpdate(updates);

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
                const finalOnlineCount = finalMembersList.filter(([, m]) => m.status === MEMBER_STATUS.ONLINE).length;
                const finalAwayCount = finalMembersList.filter(([, m]) => m.status === MEMBER_STATUS.AWAY).length;

                if (finalOnlineCount > 0 || finalAwayCount > 0) {
                  console.log(`[DisconnectMonitor] 🛑 ABORT CLOSURE: Room ${roomId} has ${finalOnlineCount} online + ${finalAwayCount} away players. NOT closing!`);
                  return; // DO NOT close - someone is still there!
                }

                console.log(`[DisconnectMonitor] ✅ Confirmed: ALL players still offline. Closing room ${roomId}`);

                // Batch close the room
                const closeUpdates = {
                  [`rooms/${roomId}/status`]: ROOM_STATUS.CLOSED,
                  [`rooms/${roomId}/roomStatus`]: ROOM_STATUS.CLOSED,
                  [`rooms/${roomId}/closedAt`]: 'SERVER_TIMESTAMP',
                  [`rooms/${roomId}/closeReason`]: 'Auto-closed: All players disconnected'
                };

                await batchUpdate(closeUpdates);

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
