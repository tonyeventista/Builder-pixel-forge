/**
 * Automatic version generation utility
 * Generates version numbers based on build time and package.json
 */

// Get base version from package.json (will be 2.0 for major.minor)
const BASE_MAJOR = 2;
const BASE_MINOR = 0;

/**
 * Generate automatic patch version based on build timestamp
 * Format: 2.0.XX where XX is calculated from current date/time
 */
export function generateVersion(): string {
  // Calculate patch number based on days since start of 2025
  const startOfYear = new Date("2025-01-01");
  const now = new Date();
  const daysSinceStart = Math.floor(
    (now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24),
  );

  // Add hours of day to make it more granular
  const hoursToday = now.getHours();

  // Create patch version: days since 2025 + hours (e.g., day 15, hour 14 = 1514)
  const patchVersion = daysSinceStart * 100 + hoursToday;

  return `${BASE_MAJOR}.${BASE_MINOR}.${patchVersion}`;
}

/**
 * Get build timestamp for debug info
 */
export function getBuildTimestamp(): string {
  return new Date().toLocaleString("vi-VN");
}

/**
 * Get current version - this will be called in components
 */
export const currentVersion = generateVersion();

console.log(
  `🏷️ Auto-generated version: ${currentVersion} (built at ${getBuildTimestamp()})`,
);
