# Room Auto-Close and Status Management

## Overview
This document explains how the room auto-close and status management system works.

## Room Status Flow

### 1. Status Types
- **active**: At least one player is online
- **idle**: All players are away (browser tab hidden)
- **empty**: All players are offline (disconnected)
- **closed**: Room has been terminated

### 2. Status Transition Flow
```
Create Room → active
              ↓
All players away → idle → (5 min) → closed
              ↓
All players offline → empty → (5 min) → closed
              ↓
At least one player returns → active (timer resets)
```

## How It Works

### Room Monitoring (Host Only)
The `useRoomMonitor` hook runs only on the host's client and performs these tasks every 10 seconds:

1. **Count Players by Status**
   - Count online players (`status === 'online'`)
   - Count away players (`status === 'away'`)
   - Count offline players (`status === 'offline'`)

2. **Update Room Status**
   - If any player is online → `active`
   - If all players are away → `idle`
   - If all players are offline → `empty`

3. **Track Inactivity Timestamp**
   - When room becomes `idle` or `empty`, store `inactiveSince` timestamp in database
   - When room becomes `active` again, clear `inactiveSince`
   - This timestamp persists across page refreshes and component re-renders

4. **Auto-Close Logic**
   - Every 10 seconds, check if `inactiveSince` exists
   - Calculate: `timeSinceInactive = now - inactiveSince`
   - If `timeSinceInactive > 5 minutes` → close room
   - Closing sets: `status = 'closed'`, `roomStatus = 'closed'`, adds `closeReason`

## Database Fields

### Room Fields
```javascript
{
  status: 'active' | 'idle' | 'empty' | 'closed',
  roomStatus: 'open' | 'closed',
  inactiveSince: timestamp | null,  // When room became inactive
  lastActiveAt: timestamp,           // Last time room was active
  statusUpdatedAt: serverTimestamp,  // Last status change
  stats: {
    activePlayers: number,
    awayPlayers: number,
    offlinePlayers: number,
    totalPlayers: number,
    lastChecked: serverTimestamp
  },
  closeReason: string | null         // Why room was closed
}
```

## Configuration

File: `src/config/roomMonitor.js`

```javascript
{
  IDLE_TIMEOUT: 2 * 60 * 1000,        // 2 minutes
  AUTO_CLOSE_TIMEOUT: 5 * 60 * 1000,  // 5 minutes
  CHECK_INTERVAL: 10 * 1000,          // 10 seconds
  ENABLED: true,
  AUTO_CLOSE_ENABLED: true
}
```

## User Experience

### Visual Indicators
1. **Room Status Badge** - Shows current room status with color coding:
   - Green: open/active
   - Yellow: idle
   - Orange: empty
   - Red: closed

2. **Player Activity Stats** - Real-time counts:
   - Online players (green)
   - Away players (yellow)
   - Offline players (red)

3. **Auto-Close Warning Banner** - Appears when room is inactive:
   - Red pulsing banner
   - Countdown timer showing time until auto-close
   - Example: "Room will close in: 4m 23s"

4. **Close Notification** - Alert with reason when room closes:
   - "Auto-closed due to inactivity (5 minutes)"
   - "Room closed by host"
   - Or custom reason

## Testing

### Test Scenario 1: Empty Room Auto-Close
1. Create a room as host
2. Leave the room (close browser tab)
3. Check Firebase RTDB:
   - Room status should change to "empty" immediately
   - `inactiveSince` timestamp should be set
4. Wait 5 minutes
5. Room should auto-close (status changes to "closed")

### Test Scenario 2: Idle Room Auto-Close
1. Create a room as host
2. Switch to another browser tab (don't close)
3. Status changes to "idle" immediately
4. `inactiveSince` timestamp is set
5. Wait 5 minutes
6. Room auto-closes

### Test Scenario 3: Timer Reset
1. Create a room, let it become idle for 2 minutes
2. Return to tab (status → active)
3. `inactiveSince` should be cleared/null
4. Timer resets, room stays open

## Why Rooms Stay in RTDB When Empty

**This is CORRECT behavior!**

- Rooms with "empty" status are **supposed to stay in RTDB**
- They remain for up to 5 minutes before auto-closing
- This allows players to reconnect without losing the room
- Only after 5 minutes of inactivity does the room close

## Important Notes

1. **Host Dependency**: Room monitoring only runs on the host's client. If the host leaves, monitoring stops. Future enhancement: Transfer host role or use Cloud Functions.

2. **Timestamp Persistence**: `inactiveSince` is stored in the database (not in local state) to survive page refreshes and component remounts.

3. **Real-time Updates**: All players see real-time status updates and countdown timer thanks to Firebase RTDB listeners.

4. **Console Logs**: Check browser console for monitoring logs:
   - "Room XYZ is empty. Auto-close in 4 minutes"
   - "Auto-closing room XYZ due to inactivity (5 minutes)"

## Files Modified

1. `src/hooks/useRoomMonitor.js` - Core monitoring logic
2. `src/services/room.js` - Room CRUD operations
3. `src/components/RoomView.jsx` - UI with countdown timer
4. `src/config/roomMonitor.js` - Configuration
