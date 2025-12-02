# Firebase Cloud Functions - Room Cleanup

Automated cleanup system for rooms in Firebase Realtime Database.

## Features

### 🧹 Automated Cleanup (`cleanupRooms`)
Runs automatically **every 5 minutes** to clean up:

1. **Closed Rooms** - Removes rooms with `status="closed"`
2. **Stale Rooms** - Removes rooms open for more than **1 hour**

### 🔧 Manual Cleanup (`manualCleanupRooms`)
HTTP endpoint for on-demand cleanup or testing.

## Deployment Instructions

### 1. Prerequisites

Install Firebase CLI globally:
```bash
npm install -g firebase-tools
```

Login to Firebase:
```bash
firebase login
```

### 2. Initialize Firebase Project (First Time Only)

If you haven't linked your Firebase project:
```bash
firebase use --add
```
Select your project and give it an alias (e.g., "default").

### 3. Install Dependencies

```bash
cd functions
npm install
```

### 4. Deploy Functions

Deploy all functions:
```bash
firebase deploy --only functions
```

Or deploy specific function:
```bash
firebase deploy --only functions:cleanupRooms
firebase deploy --only functions:manualCleanupRooms
```

### 5. Verify Deployment

Check Firebase Console:
1. Go to https://console.firebase.google.com
2. Select your project
3. Navigate to **Functions** section
4. You should see:
   - `cleanupRooms` (Scheduled)
   - `manualCleanupRooms` (HTTP)

## Testing

### Test Scheduled Function Locally

```bash
cd functions
npm run serve
```

This starts the Firebase emulator.

### Test Manual Cleanup (HTTP)

After deployment, get the function URL from Firebase Console, then:

```bash
curl https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/manualCleanupRooms
```

Response example:
```json
{
  "success": true,
  "deletedCount": 3,
  "rooms": [
    { "roomId": "SKPETZ", "reason": "Room status is closed" },
    { "roomId": "ABC123", "reason": "Room open for 75 minutes" }
  ],
  "timestamp": 1764643898586
}
```

## Configuration

### Change Schedule

Edit `functions/index.js`:
```javascript
exports.cleanupRooms = onSchedule({
  schedule: "every 5 minutes", // Change this
  // Other options:
  // "every 10 minutes"
  // "every 1 hours"
  // "0 */2 * * *" (cron format)
  timeZone: "UTC"
}, async (event) => {
  // ...
});
```

### Change Timeout Threshold

Edit `functions/index.js`:
```javascript
const ONE_HOUR_MS = 60 * 60 * 1000; // Change this
// Examples:
// 30 minutes: 30 * 60 * 1000
// 2 hours: 2 * 60 * 60 * 1000
```

### Change Memory/Timeout

Edit `functions/index.js`:
```javascript
exports.cleanupRooms = onSchedule({
  schedule: "every 5 minutes",
  timeZone: "UTC",
  memory: "256MiB", // Options: 128MiB, 256MiB, 512MiB, 1GiB, 2GiB
  timeoutSeconds: 60 // Max 540 seconds (9 minutes)
}, async (event) => {
  // ...
});
```

After changes, redeploy:
```bash
firebase deploy --only functions
```

## Monitoring

### View Logs

Real-time logs:
```bash
firebase functions:log --only cleanupRooms
```

Last 100 lines:
```bash
firebase functions:log --limit 100
```

### Firebase Console
1. Go to Firebase Console → Functions
2. Click on function name
3. View **Logs** tab for execution history

## Costs

- **Scheduled Function**: Runs every 5 minutes = **~8,640 invocations/month**
- **Free Tier**: 2 million invocations/month (you're covered!)
- Each execution typically completes in < 1 second

## Cleanup Logic

```
For each room in database:
  IF roomStatus === "closed" OR stats.status === "closed"
    → Delete room
  ELSE IF (now - createdAt) > 1 hour
    → Delete room
```

## Troubleshooting

### Function not deploying?
```bash
# Check Node version (must be 18+)
node --version

# Update Firebase CLI
npm install -g firebase-tools@latest

# Try deploying with verbose logs
firebase deploy --only functions --debug
```

### Function not running?
1. Check Firebase Console → Functions → Logs
2. Verify schedule in Cloud Scheduler:
   - Go to Google Cloud Console
   - Navigate to Cloud Scheduler
   - Look for `firebase-schedule-cleanupRooms`

### Permissions error?
Make sure Firebase Admin has RTDB access:
1. Firebase Console → Project Settings
2. Service Accounts tab
3. Ensure service account has "Firebase Realtime Database Admin" role

## Support

For issues, check:
- Firebase Functions logs: `firebase functions:log`
- Cloud Scheduler: https://console.cloud.google.com/cloudscheduler
- Firebase Console: https://console.firebase.google.com
