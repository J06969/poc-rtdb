/**
 * Generate a random 6-character room ID
 * @returns {string} Room ID in format like "XY7Z9A"
 */
export function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a unique game ID
 * @returns {string} Game ID in format like "game_123456789"
 */
export function generateGameId() {
  return `game_${Date.now()}`;
}

/**
 * Get display name for user
 * @param {string} userId
 * @returns {string} Display name
 */
export function getUserDisplayName(userId) {
  return `User ${userId.substring(0, 4)}`;
}
