import { useEffect, useState } from 'react';
import { ref, onValue, onDisconnect, set, serverTimestamp } from 'firebase/database';
import { db } from '../config/firebase';
import { PRESENCE_CONFIG } from '../config/presence';
import { ROOM_MONITOR_CONFIG } from '../config/roomMonitor';

/**
 * Custom hook to manage user presence in a room
 * This is THE CORE FEATURE of the POC
 *
 * @param {string} roomId - The room ID
 * @param {string} userId - The user ID
 * @returns {Object} Connection status and latency
 */
export function usePresence(roomId, userId) {
  const [isConnected, setIsConnected] = useState(false);
  const [latency, setLatency] = useState(null);

  useEffect(() => {
    if (!roomId || !userId) return;

    // Reference to .info/connected - Firebase's built-in presence system
    const connectedRef = ref(db, '.info/connected');

    // Reference to this user's status in the room
    const userStatusRef = ref(db, `rooms/${roomId}/members/${userId}/status`);
    const userLastChangedRef = ref(db, `rooms/${roomId}/members/${userId}/lastChanged`);
    const userPingRef = ref(db, `rooms/${roomId}/members/${userId}/lastPing`);
    const userLatencyRef = ref(db, `rooms/${roomId}/members/${userId}/latency`);

    // Track room subscription for cleanup
    let roomUnsubscribe = null;

    // Handle tab visibility changes
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden - mark as away
        set(userStatusRef, 'away');
        set(userLastChangedRef, serverTimestamp());
      } else {
        // Tab is visible - mark as online (if connected)
        const connectedCheck = ref(db, '.info/connected');
        onValue(connectedCheck, (snapshot) => {
          if (snapshot.val()) {
            set(userStatusRef, 'online');
            set(userLastChangedRef, serverTimestamp());
          }
        }, { onlyOnce: true });
      }
    };

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const unsubscribe = onValue(connectedRef, async (snapshot) => {
      const connected = snapshot.val();
      setIsConnected(connected);

      if (connected) {
        // Check if tab is visible
        const initialStatus = document.hidden ? 'away' : 'online';

        // Increment online member count when joining
        const onlineCountRef = ref(db, `rooms/${roomId}/onlineMemberCount`);
        const roomRef = ref(db, `rooms/${roomId}`);

        // Get current count and increment
        onValue(roomRef, async (snap) => {
          const room = snap.val();
          const currentCount = (room?.onlineMemberCount || 0) + 1;
          await set(onlineCountRef, currentCount);

          console.log(`[usePresence] User ${userId} joined. Online count: ${currentCount}`);
        }, { onlyOnce: true });

        // When connected, set status based on tab visibility
        set(userStatusRef, initialStatus);
        set(userLastChangedRef, serverTimestamp());

        // When this client disconnects, automatically set status to 'offline'
        // This is the magic of Firebase RTDB's onDisconnect()
        onDisconnect(userStatusRef).set('offline');
        onDisconnect(userLastChangedRef).set(serverTimestamp());

        // CRITICAL: Decrement online count when disconnecting
        const decrementRef = ref(db, `rooms/${roomId}/onlineMemberCount`);

        // References for room closure onDisconnect handlers
        const statusRef = ref(db, `rooms/${roomId}/status`);
        const roomStatusRef = ref(db, `rooms/${roomId}/roomStatus`);
        const closedAtRef = ref(db, `rooms/${roomId}/closedAt`);
        const closeReasonRef = ref(db, `rooms/${roomId}/closeReason`);
        const deleteAtRef = ref(db, `rooms/${roomId}/deleteAt`);

        // Always set up the counter decrement
        onDisconnect(decrementRef).set(0); // Will be updated dynamically below

        // Clean up previous room subscription if it exists (for reconnection scenarios)
        if (roomUnsubscribe) {
          roomUnsubscribe();
        }

        // Subscribe to room changes to dynamically update onDisconnect behavior
        roomUnsubscribe = onValue(roomRef, (snap) => {
          const room = snap.val();
          if (!room) return;

          const currentCount = room?.onlineMemberCount || 0;
          const totalMembers = room?.members ? Object.keys(room.members).length : 1;

          console.log(`[usePresence] Member count update for ${userId}: Total members = ${totalMembers}`);

          // Update the decrement value
          const newCount = Math.max(currentCount - 1, 0);
          onDisconnect(decrementRef).set(newCount);

          // CRITICAL: Dynamically set or cancel room closure based on member count
          if (totalMembers === 1) {
            // You're alone - set up auto-close on disconnect
            console.log(`[usePresence] ${userId} is ALONE. Setting up auto-close on disconnect`);

            onDisconnect(statusRef).set('closed');
            onDisconnect(roomStatusRef).set('closed');
            onDisconnect(closedAtRef).set(serverTimestamp());
            onDisconnect(closeReasonRef).set('Auto-closed: Last member disconnected');

            const deleteTime = Date.now() + ROOM_MONITOR_CONFIG.DELETE_CLOSED_ROOM_AFTER;
            onDisconnect(deleteAtRef).set(deleteTime);
          } else {
            // Others are present - CANCEL auto-close handlers
            console.log(`[usePresence] ${userId} is NOT alone (${totalMembers} total). Canceling auto-close handlers`);

            // Cancel the close handlers - let useDisconnectMonitor handle multi-player scenarios
            onDisconnect(statusRef).cancel();
            onDisconnect(roomStatusRef).cancel();
            onDisconnect(closedAtRef).cancel();
            onDisconnect(closeReasonRef).cancel();
            onDisconnect(deleteAtRef).cancel();
          }
        });

        // CRITICAL: Set up a trigger to force room status check when THIS user disconnects
        // This writes to a timestamp that other clients monitor
        const disconnectTriggerRef = ref(db, `rooms/${roomId}/lastDisconnectAt`);
        onDisconnect(disconnectTriggerRef).set(serverTimestamp());
      }
    });

    // Ping interval to measure latency
    let pingInterval;
    if (roomId && userId && PRESENCE_CONFIG.ENABLE_LATENCY_TRACKING) {
      pingInterval = setInterval(async () => {
        // Skip ping if tab is hidden and PING_ONLY_WHEN_ACTIVE is enabled
        if (PRESENCE_CONFIG.PING_ONLY_WHEN_ACTIVE && document.hidden) {
          return;
        }

        const startTime = Date.now();

        // Send ping timestamp
        await set(userPingRef, serverTimestamp());

        // Measure latency by listening to the server timestamp
        const pingUnsubscribe = onValue(userPingRef, (snapshot) => {
          if (snapshot.val()) {
            const endTime = Date.now();
            const measuredLatency = endTime - startTime;
            setLatency(measuredLatency);
            set(userLatencyRef, measuredLatency);
          }
        }, { onlyOnce: true });
      }, PRESENCE_CONFIG.PING_INTERVAL);
    }

    return () => {
      unsubscribe();
      if (roomUnsubscribe) roomUnsubscribe();
      if (pingInterval) clearInterval(pingInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Clean up: set status to offline when component unmounts
      if (userId && roomId) {
        set(userStatusRef, 'offline');
        set(userLastChangedRef, serverTimestamp());
      }
    };
  }, [roomId, userId]);

  return { isConnected, latency };
}
