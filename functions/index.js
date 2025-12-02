const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

// Initialize Firebase Admin
admin.initializeApp();

/**
 * Scheduled Cloud Function to cleanup rooms
 * Runs every 5 minutes
 *
 * Cleanup Rules:
 * 1. Remove rooms with status="closed"
 * 2. Remove rooms that have been open for more than 1 hour
 */
exports.cleanupRooms = onSchedule({
  schedule: "every 5 minutes",
  timeZone: "UTC",
  memory: "256MiB",
  timeoutSeconds: 60
}, async (event) => {
  const db = admin.database();
  const roomsRef = db.ref("rooms");

  try {
    console.log("🧹 Starting room cleanup...");

    const snapshot = await roomsRef.once("value");
    const rooms = snapshot.val();

    if (!rooms) {
      console.log("No rooms found in database");
      return null;
    }

    const now = Date.now();
    const ONE_HOUR_MS = 60 * 60 * 1000; // 1 hour in milliseconds
    let deletedCount = 0;
    const roomsToDelete = [];

    // Analyze each room
    for (const [roomId, roomData] of Object.entries(rooms)) {
      let shouldDelete = false;
      let reason = "";

      // Rule 1: Room status is "closed"
      if (roomData.roomStatus === "closed" || roomData.stats?.status === "closed") {
        shouldDelete = true;
        reason = "Room status is closed";
      }

      // Rule 2: Room has been open for more than 1 hour
      if (!shouldDelete && roomData.createdAt) {
        const roomAge = now - roomData.createdAt;
        if (roomAge > ONE_HOUR_MS) {
          shouldDelete = true;
          reason = `Room open for ${Math.floor(roomAge / 1000 / 60)} minutes (>1 hour)`;
        }
      }

      if (shouldDelete) {
        roomsToDelete.push({
          roomId,
          reason,
          createdAt: roomData.createdAt,
          roomStatus: roomData.roomStatus
        });
      }
    }

    // Delete rooms
    if (roomsToDelete.length > 0) {
      console.log(`Found ${roomsToDelete.length} rooms to delete:`);

      const updates = {};
      for (const room of roomsToDelete) {
        updates[`rooms/${room.roomId}`] = null;
        console.log(`  ❌ Deleting ${room.roomId}: ${room.reason}`);
        deletedCount++;
      }

      await db.ref().update(updates);
      console.log(`✅ Successfully deleted ${deletedCount} rooms`);
    } else {
      console.log("✨ No rooms need cleanup");
    }

    return {
      success: true,
      deletedCount,
      timestamp: now
    };

  } catch (error) {
    console.error("❌ Error during cleanup:", error);
    throw error;
  }
});

/**
 * Manual cleanup function that can be called via HTTP
 * Useful for testing or manual triggers
 */
exports.manualCleanupRooms = require("firebase-functions/v2/https").onRequest(async (req, res) => {
  const db = admin.database();
  const roomsRef = db.ref("rooms");

  try {
    const snapshot = await roomsRef.once("value");
    const rooms = snapshot.val();

    if (!rooms) {
      return res.json({ success: true, message: "No rooms found", deletedCount: 0 });
    }

    const now = Date.now();
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const roomsToDelete = [];

    for (const [roomId, roomData] of Object.entries(rooms)) {
      let shouldDelete = false;
      let reason = "";

      if (roomData.roomStatus === "closed" || roomData.stats?.status === "closed") {
        shouldDelete = true;
        reason = "Room status is closed";
      }

      if (!shouldDelete && roomData.createdAt) {
        const roomAge = now - roomData.createdAt;
        if (roomAge > ONE_HOUR_MS) {
          shouldDelete = true;
          reason = `Room open for ${Math.floor(roomAge / 1000 / 60)} minutes`;
        }
      }

      if (shouldDelete) {
        roomsToDelete.push({ roomId, reason });
      }
    }

    if (roomsToDelete.length > 0) {
      const updates = {};
      for (const room of roomsToDelete) {
        updates[`rooms/${room.roomId}`] = null;
      }
      await db.ref().update(updates);
    }

    res.json({
      success: true,
      deletedCount: roomsToDelete.length,
      rooms: roomsToDelete,
      timestamp: now
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
