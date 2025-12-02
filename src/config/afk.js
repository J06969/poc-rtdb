/**
 * AFK (Away From Keyboard) Check Configuration
 */

export const AFK_CONFIG = {
  // Time before showing AFK check to host (in milliseconds)
  // Production: 5 * 60 * 1000 (5 minutes)
  // Testing: 1 * 60 * 1000 (1 minute)
  CHECK_INTERVAL: 1 * 60 * 1000, // 1 minute for testing

  // How long host has to respond (in seconds)
  RESPONSE_TIMEOUT: 30, // 30 seconds

  // Enable/disable AFK checks
  ENABLED: true
};
