# Manual Room Cleanup

## Close Ghost Rooms via Browser Console

If you have rooms that are stuck open with 0 online members, you can manually close them:

### Step 1: Open Browser Console
Press F12 → Console tab

### Step 2: Close a Specific Room

```javascript
// Replace with your room ID
const roomId = "PTJIEZ";

firebase.database().ref(`rooms/${roomId}`).update({
  status: 'closed',
  roomStatus: 'closed',
  closedAt: firebase.database.ServerValue.TIMESTAMP,
  closeReason: 'Manually closed: Ghost room cleanup',
  deleteAt: Date.now() + 30000 // Delete in 30 seconds
}).then(() => {
  console.log(`✅ Room ${roomId} closed successfully`);
}).catch(err => {
  console.error('Error:', err);
});
```

### Step 3: Close ALL Ghost Rooms (0 online)

```javascript
firebase.database().ref('rooms').once('value').then(snapshot => {
  const rooms = snapshot.val();
  const updates = {};
  let count = 0;

  if (rooms) {
    Object.entries(rooms).forEach(([roomId, roomData]) => {
      const members = roomData.members || {};
      const membersList = Object.entries(members);
      const onlineCount = membersList.filter(([, m]) => m.status === 'online').length;
      const awayCount = membersList.filter(([, m]) => m.status === 'away').length;

      // If no one is online or away, close it
      if (onlineCount === 0 && awayCount === 0 && roomData.roomStatus !== 'closed') {
        updates[`rooms/${roomId}/status`] = 'closed';
        updates[`rooms/${roomId}/roomStatus`] = 'closed';
        updates[`rooms/${roomId}/closedAt`] = firebase.database.ServerValue.TIMESTAMP;
        updates[`rooms/${roomId}/closeReason`] = 'Cleanup: All members offline';
        updates[`rooms/${roomId}/deleteAt`] = Date.now() + 30000;
        count++;
      }
    });
  }

  if (count > 0) {
    return firebase.database().ref().update(updates).then(() => {
      console.log(`✅ Closed ${count} ghost rooms`);
    });
  } else {
    console.log('✨ No ghost rooms found');
  }
}).catch(err => {
  console.error('Error:', err);
});
```

### Step 4: View All Rooms and Their Status

```javascript
firebase.database().ref('rooms').once('value').then(snapshot => {
  const rooms = snapshot.val();
  const roomList = [];

  if (rooms) {
    Object.entries(rooms).forEach(([roomId, roomData]) => {
      const members = roomData.members || {};
      const membersList = Object.entries(members);
      const onlineCount = membersList.filter(([, m]) => m.status === 'online').length;
      const awayCount = membersList.filter(([, m]) => m.status === 'away').length;
      const offlineCount = membersList.filter(([, m]) => m.status === 'offline').length;

      roomList.push({
        roomId,
        status: roomData.roomStatus,
        online: onlineCount,
        away: awayCount,
        offline: offlineCount,
        total: membersList.length
      });
    });
  }

  console.table(roomList);
}).catch(err => {
  console.error('Error:', err);
});
```

## Automatic Cleanup (Cloud Functions)

For permanent solution, deploy the Cloud Functions:

```bash
cd functions
npm install
firebase deploy --only functions
```

The `cleanupRooms` function runs every 5 minutes and automatically closes:
- Rooms with status="closed"
- Rooms open for more than 1 hour

See `functions/README.md` for details.
