/**
 * Room Monitor Configuration
 * Controls automatic room status tracking and termination
 */

export const ROOM_MONITOR_CONFIG = {
  // Time before auto-closing when room is EMPTY (all players offline)
  // This is fast to clean up abandoned rooms
  EMPTY_AUTO_CLOSE_TIMEOUT: 3 * 1000, // 3 seconds

  // Time before auto-closing when room is IDLE (all players away/tab hidden)
  // This is slower to give players time to come back
  IDLE_AUTO_CLOSE_TIMEOUT: 5 * 60 * 1000, // 5 minutes

  // Time to wait before DELETING a closed room from RTDB
  // This allows time to read close reason and final stats
  DELETE_CLOSED_ROOM_AFTER: 30 * 1000, // 30 seconds

  // How often to check room status (in milliseconds)
  CHECK_INTERVAL: 30 * 1000, // 30 seconds

  // Enable/disable automatic room monitoring
  ENABLED: true,

  // Enable/disable auto-close feature
  AUTO_CLOSE_ENABLED: true,
};
