import { useEffect, useRef, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../config/firebase';
import { transferHost } from '../services/room';

/**
 * Hook to monitor host status and automatically transfer host when the host leaves
 *
 * @param {string} roomId - The room ID to monitor
 * @param {string} currentUserId - The current user's ID
 * @returns {Object} { newHostName: string|null, isHost: boolean }
 */
export function useHostTransfer(roomId, currentUserId) {
  const [newHostName, setNewHostName] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const previousHostRef = useRef(null);
  const transferInProgressRef = useRef(false);

  useEffect(() => {
    if (!roomId) return;

    console.log('👑 [useHostTransfer] Starting to monitor room:', roomId);

    const roomRef = ref(db, `rooms/${roomId}`);

    const unsubscribe = onValue(roomRef, async (snapshot) => {
      const roomData = snapshot.val();

      if (!roomData) {
        console.log('👑 [useHostTransfer] Room not found');
        return;
      }

      const members = roomData.members || {};
      const membersList = Object.entries(members);

      // Find current host
      const hostEntry = membersList.find(([, memberData]) => memberData.role === 'host');

      if (!hostEntry) {
        console.log('👑 [useHostTransfer] No host found in room');
        return;
      }

      const [hostId, hostData] = hostEntry;

      // Check if current user is the host
      setIsHost(hostId === currentUserId);

      // Store initial host
      if (previousHostRef.current === null) {
        previousHostRef.current = hostId;
        console.log('👑 [useHostTransfer] Initial host:', hostData.name, hostId);
        return;
      }

      // Detect host leaving (status changed to offline) OR going away
      const shouldTransfer =
        hostId === previousHostRef.current &&
        (hostData.status === 'offline' || hostData.status === 'away');

      if (shouldTransfer) {
        // Check if there are online players available (only transfer if someone is actively online)
        const onlinePlayers = membersList.filter(([userId, memberData]) => {
          return userId !== hostId && memberData.status === 'online';
        });

        // Only transfer if:
        // 1. Host went offline (always transfer), OR
        // 2. Host went away AND there are online players available
        const shouldProceedWithTransfer =
          hostData.status === 'offline' ||
          (hostData.status === 'away' && onlinePlayers.length > 0);

        if (!shouldProceedWithTransfer) {
          console.log('👑 [useHostTransfer] Host is away but no online players available, keeping current host');
          return;
        }

        console.log(`👑 [useHostTransfer] Host went ${hostData.status}:`, hostData.name);

        // Prevent multiple simultaneous transfers
        if (transferInProgressRef.current) {
          console.log('👑 [useHostTransfer] Transfer already in progress, skipping');
          return;
        }

        transferInProgressRef.current = true;

        try {
          // Attempt to transfer host
          const newHostId = await transferHost(roomId, hostId);

          if (newHostId) {
            // Find new host name
            const newHost = members[newHostId];
            if (newHost) {
              console.log('👑 [useHostTransfer] New host assigned:', newHost.name);
              setNewHostName(newHost.name);

              // Clear notification after 5 seconds
              setTimeout(() => {
                setNewHostName(null);
              }, 5000);
            }
          } else {
            console.log('👑 [useHostTransfer] No eligible players for host transfer');
          }
        } catch (error) {
          console.error('👑 [useHostTransfer] Error during host transfer:', error);
        } finally {
          transferInProgressRef.current = false;
        }
      }

      // Update previous host reference
      if (hostId !== previousHostRef.current) {
        console.log('👑 [useHostTransfer] Host changed from', previousHostRef.current, 'to', hostId);
        previousHostRef.current = hostId;
      }
    });

    return () => {
      console.log('👑 [useHostTransfer] Cleaning up');
      unsubscribe();
      previousHostRef.current = null;
      transferInProgressRef.current = false;
    };
  }, [roomId, currentUserId]);

  return { newHostName, isHost };
}
