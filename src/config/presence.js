/**
 * Presence and ping configuration
 */

export const PRESENCE_CONFIG = {
  // Ping interval in milliseconds
  // 3000ms = 3 seconds (high frequency, good for demo, higher cost)
  // 10000ms = 10 seconds (balanced)
  // 30000ms = 30 seconds (low frequency, lower cost)
  // 60000ms = 1 minute (very low frequency, minimal cost)
  PING_INTERVAL: 15000, // 15 seconds - good balance for production

  // Enable/disable latency tracking entirely
  // Set to false to disable pings and save costs (only presence detection)
  ENABLE_LATENCY_TRACKING: true,

  // Only ping when tab is visible (saves bandwidth when user is away)
  PING_ONLY_WHEN_ACTIVE: true
};

/**
 * Cost calculator helper
 * @param {number} concurrentUsers - Number of concurrent users
 * @param {number} intervalMs - Ping interval in milliseconds
 * @returns {Object} Cost estimates
 */
export function calculatePingCost(concurrentUsers, intervalMs) {
  const pingsPerHour = (3600000 / intervalMs) * concurrentUsers;
  const pingsPerDay = pingsPerHour * 24;
  const pingsPerMonth = pingsPerDay * 30;

  const bytesPerPing = 150; // Approximate
  const mbPerMonth = (pingsPerMonth * bytesPerPing) / (1024 * 1024);
  const estimatedCost = mbPerMonth / 1024; // Rough estimate in dollars

  return {
    pingsPerHour,
    pingsPerDay,
    pingsPerMonth,
    mbPerMonth: mbPerMonth.toFixed(2),
    estimatedMonthlyCost: `$${estimatedCost.toFixed(2)}`
  };
}
