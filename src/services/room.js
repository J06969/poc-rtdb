import { ref, set, onValue, off, serverTimestamp, update, get } from 'firebase/database';
import { collection, doc, setDoc, Timestamp } from 'firebase/firestore';
import { db, firestore } from '../config/firebase';
import { generateRoomId, generateGameId, getUserDisplayName } from '../utils/roomUtils';
import { ROOM_MONITOR_CONFIG } from '../config/roomMonitor';

// Constants
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

const MEMBER_ROLE = {
  HOST: 'host',
  PLAYER: 'player',
  ADMIN: 'admin'
};

// Helper functions
const getSnapshot = async (reference) => {
  return new Promise((resolve) => {
    onValue(reference, resolve, { onlyOnce: true });
  });
};

const batchUpdate = async (updates) => {
  const promises = Object.entries(updates).map(([path, value]) => {
    const reference = ref(db, path);
    return set(reference, value);
  });
  return Promise.all(promises);
};

const createMemberData = (userName, role = MEMBER_ROLE.PLAYER, status = MEMBER_STATUS.ONLINE) => ({
  name: userName,
  role,
  status,
  lastChanged: serverTimestamp()
});

const createRoomStats = (activePlayers = 0, awayPlayers = 0, offlinePlayers = 0, totalPlayers = 0) => ({
  activePlayers,
  awayPlayers,
  offlinePlayers,
  totalPlayers,
  lastChecked: serverTimestamp()
});

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
      role: MEMBER_ROLE.ADMIN,
      roomId
    });

    // Step 2: Write to RTDB (Hot Data)
    const roomRef = ref(db, `rooms/${roomId}`);
    const roomData = {
      gameId,
      roomId,
      status: ROOM_STATUS.ACTIVE,
      roomStatus: ROOM_STATUS.OPEN,
      createdAt: serverTimestamp(),
      statusUpdatedAt: serverTimestamp(),
      lastActiveAt: Date.now(),
      inactiveSince: null,
      totalMembers: 1,
      onlineMemberCount: 0, // Will be incremented by usePresence
      stats: createRoomStats(1, 0, 0, 1),
      members: {
        [userId]: createMemberData(userName, MEMBER_ROLE.HOST, MEMBER_STATUS.ONLINE)
      }
    };

    await set(roomRef, roomData);

    return { roomId, gameId };
  } catch (error) {
    console.error('Error creating game room:', error);
    throw error;
  }
}

/**
 * Join an existing room
 * Uses atomic operations to prevent race conditions
 *
 * @param {string} roomId - The room ID to join
 * @param {string} userId - The user ID joining
 * @returns {Promise<void>}
 */
export async function joinRoom(roomId, userId) {
  try {
    const userName = getUserDisplayName(userId);
    const roomRef = ref(db, `rooms/${roomId}`);

    // Get current room data atomically
    const snapshot = await getSnapshot(roomRef);
    const roomData = snapshot.val();

    if (!roomData) {
      throw new Error(`Room ${roomId} not found`);
    }

    // Check if room is closed
    if (roomData.status === ROOM_STATUS.CLOSED || roomData.roomStatus === ROOM_STATUS.CLOSED) {
      throw new Error(`Room ${roomId} is closed`);
    }

    // Prepare batch updates
    const currentTotal = roomData.totalMembers || 0;
    const updates = {
      [`rooms/${roomId}/members/${userId}`]: createMemberData(userName, MEMBER_ROLE.PLAYER, MEMBER_STATUS.ONLINE),
      [`rooms/${roomId}/totalMembers`]: currentTotal + 1
    };

    await batchUpdate(updates);

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
    await set(memberRef, MEMBER_STATUS.OFFLINE);
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
        const isOpen = roomData.roomStatus === ROOM_STATUS.OPEN || roomData.status === ROOM_STATUS.ACTIVE;
        const isClosed = roomData.roomStatus === ROOM_STATUS.CLOSED || roomData.status === ROOM_STATUS.CLOSED;

        console.log(`🔍 Room ${roomId}:`, {
          roomStatus: roomData.roomStatus,
          status: roomData.status,
          isOpen,
          isClosed
        });

        const shouldInclude = includeClosedRooms || (isOpen && !isClosed);

        if (shouldInclude) {
          rooms.push({
            roomId,
            ...roomData,
            isOpen,
            isClosed
          });
        }
      });

      // Sort: open rooms first, then by creation time (newest first)
      rooms.sort((a, b) => {
        if (a.isOpen !== b.isOpen) {
          return a.isOpen ? -1 : 1;
        }
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
    }

    console.log('🔍 [subscribeToAllRooms] Sending rooms to callback:', rooms.length, rooms);
    callback(rooms);
  });

  return () => off(roomsRef);
}

/**
 * Find eligible players for host transfer
 * Priority: online players > away players
 *
 * @param {Array} membersList - Array of [userId, memberData] tuples
 * @param {string} currentHostId - Current host to exclude
 * @returns {Array|null} [newHostId, newHostData] or null if no eligible players
 */
const findEligibleHost = (membersList, currentHostId) => {
  const eligiblePlayers = membersList.filter(
    ([userId, memberData]) => userId !== currentHostId && memberData.status === MEMBER_STATUS.ONLINE
  );

  if (eligiblePlayers.length > 0) {
    return eligiblePlayers[0];
  }

  const awayPlayers = membersList.filter(
    ([userId, memberData]) => userId !== currentHostId && memberData.status === MEMBER_STATUS.AWAY
  );

  return awayPlayers.length > 0 ? awayPlayers[0] : null;
};

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
    const roomSnapshot = await getSnapshot(roomRef);
    const roomData = roomSnapshot.val();

    if (!roomData) {
      console.log(`👑 [transferHost] Room ${roomId} not found`);
      return null;
    }

    const members = roomData.members || {};
    const membersList = Object.entries(members);

    // Find eligible host
    const eligibleHost = findEligibleHost(membersList, currentHostId);

    if (!eligibleHost) {
      console.log(`👑 [transferHost] No eligible players found. Room will close.`);
      return null;
    }

    const [newHostId, newHostData] = eligibleHost;
    console.log(`👑 [transferHost] Transferring to ${newHostData.status} player: ${newHostData.name} (${newHostId})`);

    // Validate new host
    if (!newHostId || !newHostData) {
      console.error(`👑 [transferHost] Invalid new host data:`, { newHostId, newHostData });
      return null;
    }

    // Re-check room state to prevent race condition
    const verifySnapshot = await getSnapshot(roomRef);
    const verifyRoomData = verifySnapshot.val();

    if (!verifyRoomData || !verifyRoomData.members) {
      console.log(`👑 [transferHost] Room no longer exists, aborting transfer`);
      return null;
    }

    // Check if someone else already transferred the host
    const currentHost = Object.entries(verifyRoomData.members).find(([, m]) => m.role === MEMBER_ROLE.HOST);
    if (currentHost && currentHost[0] !== currentHostId) {
      console.log(`👑 [transferHost] Host already transferred to ${currentHost[1].name}, aborting`);
      return currentHost[0];
    }

    // Batch update: demote old host and promote new host
    const updates = {
      [`rooms/${roomId}/members/${currentHostId}/role`]: MEMBER_ROLE.PLAYER,
      [`rooms/${roomId}/members/${newHostId}/role`]: MEMBER_ROLE.HOST,
      [`rooms/${roomId}/members/${newHostId}/lastChanged`]: serverTimestamp()
    };

    await batchUpdate(updates);

    console.log(`👑 [transferHost] Host transferred successfully to: ${newHostData.name} (${newHostId})`);
    return newHostId;

  } catch (error) {
    console.error('Error transferring host:', error);
    throw error;
  }
}

/**
 * Close/terminate a room
 * Uses batch operations for efficient database writes
 *
 * @param {string} roomId - The room ID to close
 * @param {string} reason - Reason for closing (optional)
 * @returns {Promise<void>}
 */
export async function closeRoom(roomId, reason = 'Room closed by host') {
  try {
    const deleteTime = Date.now() + ROOM_MONITOR_CONFIG.DELETE_CLOSED_ROOM_AFTER;
    const deleteInSeconds = Math.round(ROOM_MONITOR_CONFIG.DELETE_CLOSED_ROOM_AFTER / 1000);

    // Batch all updates together
    const updates = {
      [`rooms/${roomId}/roomStatus`]: ROOM_STATUS.CLOSED,
      [`rooms/${roomId}/status`]: ROOM_STATUS.CLOSED,
      [`rooms/${roomId}/closedAt`]: serverTimestamp(),
      [`rooms/${roomId}/closeReason`]: reason,
      [`rooms/${roomId}/deleteAt`]: deleteTime
    };

    await batchUpdate(updates);

    console.log('Room closed:', roomId, 'Reason:', reason, `| Will delete in ${deleteInSeconds}s`);
  } catch (error) {
    console.error('Error closing room:', error);
    throw error;
  }
}

/**
 * Calculate player counts from members
 *
 * @param {Object} members - Room members object
 * @returns {Object} Player counts by status
 */
const calculatePlayerCounts = (members = {}) => {
  const membersList = Object.entries(members);

  return {
    activePlayers: membersList.filter(([, m]) => m.status === MEMBER_STATUS.ONLINE).length,
    awayPlayers: membersList.filter(([, m]) => m.status === MEMBER_STATUS.AWAY).length,
    offlinePlayers: membersList.filter(([, m]) => m.status === MEMBER_STATUS.OFFLINE).length,
    totalPlayers: membersList.length
  };
};

/**
 * Get room status information
 *
 * @param {string} roomId - The room ID
 * @returns {Promise<Object>} Room status information
 */
export async function getRoomStatus(roomId) {
  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await getSnapshot(roomRef);
  const roomData = snapshot.val();

  if (!roomData) {
    throw new Error('Room not found');
  }

  const playerCounts = calculatePlayerCounts(roomData.members);

  return {
    status: roomData.status,
    roomStatus: roomData.roomStatus,
    ...playerCounts,
    stats: roomData.stats
  };
}

/**
 * Determine room status based on player activity
 *
 * @param {Object} playerCounts - Player counts by status
 * @returns {string} Room status
 */
const determineRoomStatus = ({ activePlayers, awayPlayers, offlinePlayers }) => {
  if (activePlayers === 0 && awayPlayers === 0 && offlinePlayers > 0) {
    return ROOM_STATUS.EMPTY;
  }
  if (activePlayers === 0 && awayPlayers > 0) {
    return ROOM_STATUS.IDLE;
  }
  return ROOM_STATUS.ACTIVE;
};

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

    // Get current room data
    const roomSnapshot = await getSnapshot(roomRef);
    const roomData = roomSnapshot.val();

    if (!roomData) {
      throw new Error('Room not found');
    }

    console.log(`[updateRoomStatus] Current room data:`, {
      status: roomData.status,
      stats: roomData.stats
    });

    // Don't update if room is already closed
    if (roomData.status === ROOM_STATUS.CLOSED || roomData.roomStatus === ROOM_STATUS.CLOSED) {
      console.log(`[updateRoomStatus] Room ${roomId} is closed, skipping update`);
      return;
    }

    // Calculate current status
    const status = await getRoomStatus(roomId);
    console.log(`[updateRoomStatus] Calculated status:`, status);

    const newStatus = determineRoomStatus(status);
    console.log(`[updateRoomStatus] Determined new status: ${newStatus.toUpperCase()}`);

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

    // Prepare batch updates
    const updates = {};

    // Update status if changed
    if (statusChanged) {
      updates[`rooms/${roomId}/status`] = newStatus;
      updates[`rooms/${roomId}/statusUpdatedAt`] = serverTimestamp();

      // Handle inactiveSince timestamp
      if (newStatus === ROOM_STATUS.IDLE || newStatus === ROOM_STATUS.EMPTY) {
        if (!roomData.inactiveSince) {
          updates[`rooms/${roomId}/inactiveSince`] = Date.now();
          console.log(`[updateRoomStatus] Room ${roomId} became ${newStatus}, setting inactiveSince`);
        }
      } else if (newStatus === ROOM_STATUS.ACTIVE) {
        if (roomData.inactiveSince !== null) {
          updates[`rooms/${roomId}/inactiveSince`] = null;
        }
        updates[`rooms/${roomId}/lastActiveAt`] = Date.now();
        console.log(`[updateRoomStatus] Room ${roomId} became active, clearing inactiveSince`);
      }
    }

    // Update stats if changed
    if (statsChanged) {
      updates[`rooms/${roomId}/stats`] = createRoomStats(
        status.activePlayers,
        status.awayPlayers,
        status.offlinePlayers,
        status.totalPlayers
      );
    }

    // Execute batch update
    await batchUpdate(updates);

  } catch (error) {
    console.error('Error updating room status:', error);
    throw error;
  }
}
