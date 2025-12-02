# Testing Room Closure Logic

## Purpose
Verify that rooms ONLY close when ALL players are offline, not when just one player leaves.

---

## Test Cases

### ✅ Test 1: One Player Leaves, Others Stay (Room MUST Stay Open)

**Setup:**
1. Open browser tab #1 (incognito)
2. Login and create a room
3. Note the Room ID
4. Open browser tab #2 (regular window)
5. Login and join the same room
6. Verify both players show as "online" in the room

**Action:**
- Close tab #1 (host leaves)

**Expected Result:**
✅ Tab #2 shows: "👑 New Host Assigned! [Your name] is now the room host"
✅ Room STAYS OPEN
✅ Tab #2 can continue using the room
✅ Console in tab #2 shows:
```
[DisconnectMonitor] ✅ Room ABC123 has 1 online + 0 away players. Room stays OPEN.
```

**Failure Mode:**
❌ If room closes → BUG! Room should stay open

---

### ✅ Test 2: Multiple Players, One Leaves (Room MUST Stay Open)

**Setup:**
1. Create room (tab #1)
2. Join with player 2 (tab #2)
3. Join with player 3 (tab #3)
4. All 3 tabs show online

**Action:**
- Close tab #2 (middle player leaves)

**Expected Result:**
✅ Tabs #1 and #3 remain open
✅ Room stays open
✅ No closure warnings
✅ Console shows player count decreased but room stays open

**Failure Mode:**
❌ If room closes → BUG!

---

### ✅ Test 3: ALL Players Leave (Room MUST Close)

**Setup:**
1. Create room (tab #1)
2. Join with player 2 (tab #2)

**Action:**
- Close BOTH tabs #1 and #2

**Expected Result:**
✅ Room closes after 3 seconds
✅ Console shows:
```
[DisconnectMonitor] ❌ ALL 2 members offline! Room ABC123 will close in 3s
[DisconnectMonitor] ✅ Confirmed: ALL players still offline. Closing room ABC123
```
✅ In lobby, room appears as "🔒 CLOSED"
✅ Room deleted after 30 seconds

**Failure Mode:**
❌ If room stays open → BUG! Should close

---

### ✅ Test 4: Last Player Leaves Alone (Room MUST Close)

**Setup:**
1. Create room (only 1 player)

**Action:**
- Close the tab

**Expected Result:**
✅ Room closes after 3 seconds
✅ Room deleted after 30 seconds

---

### ✅ Test 5: Host Leaves, Only Away Players Remain (Room MUST Stay Open)

**Setup:**
1. Create room (tab #1)
2. Join with player 2 (tab #2)
3. In tab #2, switch to another tab (player 2 becomes "away")
4. Wait for tab #2 to show "away" status

**Action:**
- Close tab #1 (host leaves)

**Expected Result:**
✅ Room stays open
✅ Tab #2 (when you switch back) shows: "👑 You are now the room host"
✅ Console shows:
```
[DisconnectMonitor] ✅ Room ABC123 has 0 online + 1 away players. Room stays OPEN.
```

**Failure Mode:**
❌ If room closes → BUG!

---

## Debugging Console Logs

### When Working Correctly:

**One player leaves, others online:**
```
[DisconnectMonitor] Disconnect detected in room ABC123
[DisconnectMonitor] 🔍 Room ABC123 status check:
  online: 1
  away: 0
  offline: 1
  total: 2
[DisconnectMonitor] ✅ Room ABC123 has 1 online + 0 away players. Room stays OPEN.
```

**All players leave:**
```
[DisconnectMonitor] Disconnect detected in room ABC123
[DisconnectMonitor] 🔍 Room ABC123 status check:
  online: 0
  away: 0
  offline: 2
  total: 2
[DisconnectMonitor] ❌ ALL 2 members offline! Room ABC123 will close in 3s
[DisconnectMonitor] ✅ Confirmed: ALL players still offline. Closing room ABC123
[DisconnectMonitor] Room ABC123 closed successfully
```

**If room was about to close but someone reconnected:**
```
[DisconnectMonitor] 🛑 ABORT CLOSURE: Room ABC123 has 1 online + 0 away players. NOT closing!
```

---

## Common Issues & Solutions

### Issue: Room closes when one player leaves (but others are still online)

**Possible Causes:**
1. Race condition - statuses not updated in time
2. Multiple close triggers happening simultaneously

**Debug Steps:**
1. Open browser console (F12) on remaining player's tab
2. Look for logs showing player counts
3. Check if `onlineCount` shows 0 when it should show > 0

**Fix Applied (Latest - Dec 2025):**
- **Root Cause:** onDisconnect handlers were set once and never updated
- **Solution:** Made onDisconnect handlers dynamic:
  - Continuously monitor room member count
  - When alone (totalMembers=1): Set auto-close handlers
  - When others join (totalMembers>1): Cancel auto-close handlers using .cancel()
  - Proper cleanup to prevent memory leaks
- Added 2-second wait before checking player statuses (useDisconnectMonitor)
- Added double-check before room closure
- Added early return if ANY players are online/away

**Technical Details:**
- File: `src/hooks/usePresence.js` lines 104-139
- Uses Firebase onDisconnect().cancel() to remove stale handlers
- Room subscription updates in real-time as members join/leave

### Issue: Room doesn't close when ALL players leave

**Possible Causes:**
1. lastDisconnectAt trigger not firing
2. Firebase onDisconnect handlers not working

**Debug Steps:**
1. Check Firebase Realtime Database console
2. Look for `lastDisconnectAt` field updates
3. Check if members' statuses change to "offline"

---

## Manual Verification Checklist

Use this checklist to verify the fix:

- [ ] Test 1: One player leaves, room stays open ✅
- [ ] Test 2: Multiple players, one leaves, room stays open ✅
- [ ] Test 3: ALL players leave, room closes ✅
- [ ] Test 4: Last player leaves alone, room closes ✅
- [ ] Test 5: Host leaves, away players remain, room stays open ✅
- [ ] Console logs show correct player counts ✅
- [ ] No premature room closures ✅
- [ ] Host transfer works correctly ✅

---

## Expected Behavior Summary

| Scenario | Online | Away | Offline | Expected |
|----------|--------|------|---------|----------|
| Host + 2 players, host leaves | 2 | 0 | 1 | Room OPEN ✅ |
| Host + 1 player, both leave | 0 | 0 | 2 | Room CLOSES ❌ |
| Host + 1 away, host leaves | 0 | 1 | 1 | Room OPEN ✅ |
| Host alone, leaves | 0 | 0 | 1 | Room CLOSES ❌ |
| 3 players, 1 leaves | 2 | 0 | 1 | Room OPEN ✅ |

---

## Quick Test Script

Open browser console and run after joining a room:

```javascript
// Check current room status
const roomId = "YOUR_ROOM_ID";
const db = firebase.database();
db.ref(`rooms/${roomId}/members`).once('value').then(snap => {
  const members = snap.val();
  const list = Object.entries(members || {});
  console.log('Members:', list.map(([id, data]) => ({
    name: data.name,
    status: data.status,
    role: data.role
  })));
});
```

This will show you all members and their current status.
