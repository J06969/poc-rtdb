import { ref, set, onValue, off, serverTimestamp } from 'firebase/database';
import { collection, doc, setDoc, Timestamp } from 'firebase/firestore';
import { db, firestore } from '../config/firebase';
import { generateRoomId, generateGameId, getUserDisplayName } from '../utils/roomUtils';
import { ROOM_MONITOR_CONFIG } from '../config/roomMonitor';

/**
 * Create a new game room
 * This function writes to BOTH Firestore (persistent) and RTDB (hot data)
 *
 * @param {string} userId - The user ID creating the room
 * @returns {Promise<Object>} Room data with roomId and gameId
 */
export async function createGameRoom(userId) {
  try {
    const roomId = generateRoomId();
    const gameId = generateGameId();
    const userName = getUserDisplayName(userId);

    // Step 1: Write to Firestore (Persistent Data)
    const gameStatsRef = doc(firestore, `Users/${userId}/GameStats/${gameId}`);
    await setDoc(gameStatsRef, {
      created_at: Timestamp.now(),
      initial_score: 0,
      role: 'admin',
      roomId: roomId
    });

    // Step 2: Write to RTDB (Hot Data)
    const roomRef = ref(db, `rooms/${roomId}`);
    await set(roomRef, {
      gameId: gameId,
      roomId: roomId,
      status: 'active',
      roomStatus: 'open',
      createdAt: serverTimestamp(),
      statusUpdatedAt: serverTimestamp(),
      lastActiveAt: Date.now(),
      inactiveSince: null,
      totalMembers: 1,
      onlineMemberCount: 0, // Will be incremented by usePresence
      stats: {
        activePlayers: 1,
        awayPlayers: 0,
        offlinePlayers: 0,
        totalPlayers: 1,
        lastChecked: serverTimestamp()
      },
      members: {
        [userId]: {
          name: userName,
          role: 'host',
          status: 'online',
          lastChanged: serverTimestamp()
        }
      }
    });

    return { roomId, gameId };
  } catch (error) {
    console.error('Error creating game room:', error);
    throw error;
  }
}

/**
 * Join an existing room
 *
 * @param {string} roomId - The room ID to join
 * @param {string} userId - The user ID joining
 * @returns {Promise<void>}
 */
export async function joinRoom(roomId, userId) {
  try {
    const userName = getUserDisplayName(userId);
    const memberRef = ref(db, `rooms/${roomId}/members/${userId}`);

    await set(memberRef, {
      name: userName,
      role: 'player',
      status: 'online',
      lastChanged: serverTimestamp()
    });

    // Increment total members
    const totalMembersRef = ref(db, `rooms/${roomId}/totalMembers`);
    const roomRef = ref(db, `rooms/${roomId}`);

    // Get current total and increment
    onValue(roomRef, (snapshot) => {
      const roomData = snapshot.val();
      if (roomData) {
        const currentTotal = roomData.totalMembers || 0;
        set(totalMembersRef, currentTotal + 1);
      }
    }, { onlyOnce: true });

  } catch (error) {
    console.error('Error joining room:', error);
    throw error;
  }
}

/**
 * Subscribe to room updates
 *
 * @param {string} roomId - The room ID to listen to
 * @param {Function} callback - Callback function to receive updates
 * @returns {Function} Unsubscribe function
 */
export function subscribeToRoom(roomId, callback) {
  const roomRef = ref(db, `rooms/${roomId}`);

  onValue(roomRef, (snapshot) => {
    const data = snapshot.val();
    callback(data);
  });

  // Return unsubscribe function
  return () => off(roomRef);
}

/**
 * Leave a room
 *
 * @param {string} roomId - The room ID
 * @param {string} userId - The user ID
 * @returns {Promise<void>}
 */
export async function leaveRoom(roomId, userId) {
  try {
    const memberRef = ref(db, `rooms/${roomId}/members/${userId}/status`);
    await set(memberRef, 'offline');
  } catch (error) {
    console.error('Error leaving room:', error);
    throw error;
  }
}

/**
 * Get all rooms (both open and closed)
 *
 * @param {Function} callback - Callback function to receive rooms data
 * @param {boolean} includeClosedRooms - Whether to include closed rooms (default: true)
 * @returns {Function} Unsubscribe function
 */
export function subscribeToAllRooms(callback, includeClosedRooms = true) {
  const roomsRef = ref(db, 'rooms');

  onValue(roomsRef, (snapshot) => {
    const data = snapshot.val();
    const rooms = [];

    console.log('🔍 [subscribeToAllRooms] Raw data from RTDB:', data);

    if (data) {
      Object.entries(data).forEach(([roomId, roomData]) => {
        // Include all rooms or filter based on status
        const isOpen = roomData.roomStatus === 'open' || roomData.status === 'active';
        const isClosed = roomData.roomStatus === 'closed' || roomData.status === 'closed';

        console.log(`🔍 Room ${roomId}:`, {
          roomStatus: roomData.roomStatus,
          status: roomData.status,
          isOpen,
          isClosed
        });

        if (includeClosedRooms) {
          // Include all rooms
          rooms.push({
            roomId,
            ...roomData,
            isOpen,
            isClosed
          });
        } else {
          // Only include open rooms
          if (isOpen && !isClosed) {
            rooms.push({
              roomId,
              ...roomData,
              isOpen: true,
              isClosed: false
            });
          }
        }
      });

      // Sort: open rooms first, then by creation time (newest first)
      rooms.sort((a, b) => {
        // Open rooms come first
        if (a.isOpen && !b.isOpen) return -1;
        if (!a.isOpen && b.isOpen) return 1;

        // Then sort by creation time (newest first)
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
    }

    console.log('🔍 [subscribeToAllRooms] Sending rooms to callback:', rooms.length, rooms);
    callback(rooms);
  });

  return () => off(roomsRef);
}

/**
 * Transfer host role to another player
 * Called when the current host leaves the room
 *
 * @param {string} roomId - The room ID
 * @param {string} currentHostId - The current host's user ID (leaving)
 * @returns {Promise<string|null>} New host's user ID or null if no one to transfer to
 */
export async function transferHost(roomId, currentHostId) {
  try {
    console.log(`👑 [transferHost] Starting host transfer for room ${roomId}, current host: ${currentHostId}`);

    const roomRef = ref(db, `rooms/${roomId}`);

    // Get current room data
    const roomSnapshot = await new Promise((resolve) => {
      onValue(roomRef, resolve, { onlyOnce: true });
    });

    const roomData = roomSnapshot.val();
    if (!roomData) {
      console.log(`👑 [transferHost] Room ${roomId} not found`);
      return null;
    }

    const members = roomData.members || {};
    const membersList = Object.entries(members);

    // Find online players excluding the current host
    const eligiblePlayers = membersList.filter(([userId, memberData]) => {
      return userId !== currentHostId && memberData.status === 'online';
    });

    console.log(`👑 [transferHost] Eligible players:`, eligiblePlayers.length);

    if (eligiblePlayers.length === 0) {
      // No one else online - check for away players
      const awayPlayers = membersList.filter(([userId, memberData]) => {
        return userId !== currentHostId && memberData.status === 'away';
      });

      if (awayPlayers.length === 0) {
        console.log(`👑 [transferHost] No eligible players found. Room will close.`);
        return null;
      }

      // Transfer to away player as last resort
      const [newHostId, newHostData] = awayPlayers[0];

      // Demote old host to player
      const oldHostRef = ref(db, `rooms/${roomId}/members/${currentHostId}/role`);
      await set(oldHostRef, 'player');

      // Promote new host
      const newHostRef = ref(db, `rooms/${roomId}/members/${newHostId}/role`);
      await set(newHostRef, 'host');

      console.log(`👑 [transferHost] Host transferred to away player: ${newHostData.name} (${newHostId})`);
      return newHostId;
    }

    // Demote old host to player
    const oldHostRef = ref(db, `rooms/${roomId}/members/${currentHostId}/role`);
    await set(oldHostRef, 'player');

    // Transfer host to first online player
    const [newHostId, newHostData] = eligiblePlayers[0];
    const newHostRef = ref(db, `rooms/${roomId}/members/${newHostId}/role`);
    await set(newHostRef, 'host');

    // Update last changed timestamp
    const lastChangedRef = ref(db, `rooms/${roomId}/members/${newHostId}/lastChanged`);
    await set(lastChangedRef, serverTimestamp());

    console.log(`👑 [transferHost] Host transferred successfully to: ${newHostData.name} (${newHostId})`);
    return newHostId;

  } catch (error) {
    console.error('Error transferring host:', error);
    throw error;
  }
}

/**
 * Close/terminate a room
 *
 * @param {string} roomId - The room ID to close
 * @param {string} reason - Reason for closing (optional)
 * @returns {Promise<void>}
 */
export async function closeRoom(roomId, reason = 'Room closed by host') {
  try {
    const roomStatusRef = ref(db, `rooms/${roomId}/roomStatus`);
    const statusRef = ref(db, `rooms/${roomId}/status`);
    const closedAtRef = ref(db, `rooms/${roomId}/closedAt`);
    const closeReasonRef = ref(db, `rooms/${roomId}/closeReason`);
    const deleteAtRef = ref(db, `rooms/${roomId}/deleteAt`);

    await set(roomStatusRef, 'closed');
    await set(statusRef, 'closed');
    await set(closedAtRef, serverTimestamp());
    await set(closeReasonRef, reason);

    // Schedule deletion
    const deleteTime = Date.now() + ROOM_MONITOR_CONFIG.DELETE_CLOSED_ROOM_AFTER;
    await set(deleteAtRef, deleteTime);

    const deleteInSeconds = Math.round(ROOM_MONITOR_CONFIG.DELETE_CLOSED_ROOM_AFTER / 1000);
    console.log('Room closed:', roomId, 'Reason:', reason, `| Will delete in ${deleteInSeconds}s`);
  } catch (error) {
    console.error('Error closing room:', error);
    throw error;
  }
}

/**
 * Get room status information
 *
 * @param {string} roomId - The room ID
 * @returns {Promise<Object>} Room status information
 */
export async function getRoomStatus(roomId) {
  return new Promise((resolve, reject) => {
    const roomRef = ref(db, `rooms/${roomId}`);

    onValue(roomRef, (snapshot) => {
      const roomData = snapshot.val();
      if (roomData) {
        const members = roomData.members || {};
        const membersList = Object.entries(members);

        const activePlayers = membersList.filter(([, m]) => m.status === 'online').length;
        const awayPlayers = membersList.filter(([, m]) => m.status === 'away').length;
        const offlinePlayers = membersList.filter(([, m]) => m.status === 'offline').length;

        resolve({
          status: roomData.status,
          roomStatus: roomData.roomStatus,
          activePlayers,
          awayPlayers,
          offlinePlayers,
          totalPlayers: membersList.length,
          stats: roomData.stats,
        });
      } else {
        reject(new Error('Room not found'));
      }
    }, { onlyOnce: true });
  });
}

/**
 * Update room status based on player activity
 * OPTIMIZED: Only writes to Firebase when values actually change
 *
 * @param {string} roomId - The room ID
 * @returns {Promise<void>}
 */
export async function updateRoomStatus(roomId) {
  try {
    console.log(`[updateRoomStatus] ===== Starting update for room ${roomId} =====`);
    const roomRef = ref(db, `rooms/${roomId}`);

    // Get current room data first
    const roomSnapshot = await new Promise((resolve) => {
      onValue(roomRef, resolve, { onlyOnce: true });
    });

    const roomData = roomSnapshot.val();
    if (!roomData) {
      throw new Error('Room not found');
    }

    console.log(`[updateRoomStatus] Current room data:`, {
      status: roomData.status,
      stats: roomData.stats
    });

    // Don't update if room is already closed
    if (roomData.status === 'closed' || roomData.roomStatus === 'closed') {
      console.log(`[updateRoomStatus] Room ${roomId} is closed, skipping update`);
      return;
    }

    const status = await getRoomStatus(roomId);
    console.log(`[updateRoomStatus] Calculated status:`, {
      activePlayers: status.activePlayers,
      awayPlayers: status.awayPlayers,
      offlinePlayers: status.offlinePlayers,
      totalPlayers: status.totalPlayers
    });

    let newStatus = 'active';

    if (status.activePlayers === 0 && status.awayPlayers === 0 && status.offlinePlayers > 0) {
      newStatus = 'empty';
      console.log(`[updateRoomStatus] Determined new status: EMPTY (all players offline)`);
    } else if (status.activePlayers === 0 && status.awayPlayers > 0) {
      newStatus = 'idle';
      console.log(`[updateRoomStatus] Determined new status: IDLE (all players away)`);
    } else if (status.activePlayers > 0) {
      newStatus = 'active';
      console.log(`[updateRoomStatus] Determined new status: ACTIVE (${status.activePlayers} players online)`);
    }

    const currentStatus = roomData.status;
    const currentStats = roomData.stats || {};

    // Check if stats actually changed
    const statsChanged =
      currentStats.activePlayers !== status.activePlayers ||
      currentStats.awayPlayers !== status.awayPlayers ||
      currentStats.offlinePlayers !== status.offlinePlayers ||
      currentStats.totalPlayers !== status.totalPlayers;

    // Check if status changed
    const statusChanged = currentStatus !== newStatus;

    // Only write if something actually changed
    if (!statusChanged && !statsChanged) {
      console.log(`[updateRoomStatus] Room ${roomId} - no changes detected, skipping write`);
      return;
    }

    console.log(`[updateRoomStatus] Room ${roomId} updating:`, {
      statusChanged: statusChanged ? `${currentStatus} → ${newStatus}` : 'no change',
      statsChanged: statsChanged ? `${currentStats.activePlayers}→${status.activePlayers} active` : 'no change'
    });

    // Only update status if it changed
    if (statusChanged) {
      const statusRef = ref(db, `rooms/${roomId}/status`);
      const statusUpdatedRef = ref(db, `rooms/${roomId}/statusUpdatedAt`);
      await set(statusRef, newStatus);
      await set(statusUpdatedRef, serverTimestamp());
    }

    // Only update stats if they changed
    if (statsChanged) {
      const statsRef = ref(db, `rooms/${roomId}/stats`);
      await set(statsRef, {
        activePlayers: status.activePlayers,
        awayPlayers: status.awayPlayers,
        offlinePlayers: status.offlinePlayers,
        totalPlayers: status.totalPlayers,
        lastChecked: serverTimestamp()
      });
    }

    // Handle inactiveSince timestamp - only when status changes
    if (statusChanged) {
      if (newStatus === 'idle' || newStatus === 'empty') {
        // Room became inactive - set timestamp if not already set
        if (!roomData.inactiveSince) {
          const inactiveSinceRef = ref(db, `rooms/${roomId}/inactiveSince`);
          await set(inactiveSinceRef, Date.now());
          console.log(`[updateRoomStatus] Room ${roomId} became ${newStatus}, setting inactiveSince`);
        }
      } else if (newStatus === 'active') {
        // Room became active - clear timestamp and update lastActiveAt
        if (roomData.inactiveSince !== null) {
          const inactiveSinceRef = ref(db, `rooms/${roomId}/inactiveSince`);
          await set(inactiveSinceRef, null);
        }
        // Only update lastActiveAt if it changed status to active
        const lastActiveAtRef = ref(db, `rooms/${roomId}/lastActiveAt`);
        await set(lastActiveAtRef, Date.now());
        console.log(`[updateRoomStatus] Room ${roomId} became active, clearing inactiveSince`);
      }
    }

  } catch (error) {
    console.error('Error updating room status:', error);
    throw error;
  }
}
