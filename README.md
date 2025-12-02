# Realtime Game Sync POC

A Proof of Concept demonstrating Firebase Realtime Database's presence detection system for game rooms. This project showcases a hybrid database architecture using Firebase RTDB for "hot" ephemeral data and Firestore for persistent data.

## Features

- **Real-time Presence Detection**: Automatic online/offline status updates using Firebase RTDB's `.info/connected` and `onDisconnect()` primitives
- **Hybrid Database Architecture**:
  - RTDB for live game state, lobby membership, and connection status
  - Firestore for persistent game history and stats
- **Anonymous Authentication**: Quick testing with Firebase Anonymous Auth
- **Custom Token Support**: Integration with existing backends via custom tokens
- **Real-time Synchronization**: Live updates across all connected clients

## Tech Stack

- **Frontend**: React 18 with Vite
- **Styling**: Tailwind CSS
- **Backend**: Firebase (Auth, Realtime Database, Firestore)
- **State Management**: React Hooks

## Prerequisites

- Node.js (v16 or higher)
- A Firebase project with:
  - Authentication enabled (Anonymous provider)
  - Realtime Database created
  - Firestore database created

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
npm install
```

### 2. Configure Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select an existing one
3. Enable Authentication:
   - Go to Authentication → Sign-in method
   - Enable "Anonymous" provider
4. Create a Realtime Database:
   - Go to Realtime Database → Create Database
   - Start in **test mode** for development
5. Create a Firestore Database:
   - Go to Firestore Database → Create Database
   - Start in **test mode** for development
6. Get your Firebase config:
   - Go to Project Settings → General
   - Scroll down to "Your apps" and click the web icon (</>)
   - Copy your Firebase configuration

### 3. Environment Variables

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Fill in your Firebase credentials in `.env`:
```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your_project_id-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 4. Run the Application

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## How to Test the POC

### Objective
Verify that Firebase RTDB automatically detects when a user goes offline and updates their status in real-time.

### Steps

1. **Open the app** in your primary browser
2. **Sign in anonymously**
3. **Create a new room** - note the Room ID (e.g., "XY7Z9A")
4. **Open a second browser** (or incognito window)
5. **Sign in** and **join the room** using the Room ID
6. **Disconnect the internet** on one of the devices
7. **Observe**: The disconnected user's status dot should turn RED within 2-5 seconds
8. **Reconnect the internet**
9. **Observe**: The status dot should turn GREEN again

### Expected Results

- User status updates happen **automatically** without manual intervention
- Offline detection occurs within **2-5 seconds**
- No HTTP polling or manual "ping" requests needed
- Status persists across page refreshes (until timeout)

## Project Structure

```
poc-rtdb/
├── src/
│   ├── components/
│   │   ├── Login.jsx           # Authentication UI
│   │   ├── CreateRoom.jsx      # Room creation/joining UI
│   │   └── RoomView.jsx        # Main room view with presence indicators
│   ├── config/
│   │   └── firebase.js         # Firebase initialization
│   ├── hooks/
│   │   ├── useAuth.js          # Authentication state hook
│   │   └── usePresence.js      # Presence detection hook (CORE POC FEATURE)
│   ├── services/
│   │   ├── auth.js             # Authentication service
│   │   └── room.js             # Room management service
│   ├── utils/
│   │   └── roomUtils.js        # Utility functions
│   ├── App.jsx                 # Main app component
│   ├── main.jsx                # App entry point
│   └── index.css               # Global styles
├── .env.example                # Environment variables template
├── package.json
└── README.md
```

## Key Implementation Details

### Presence Hook (`src/hooks/usePresence.js`)

The heart of this POC. It:
1. Listens to `.info/connected` to detect connection state
2. Sets user status to "online" when connected
3. Uses `onDisconnect()` to automatically set status to "offline" when the client disconnects
4. Updates timestamps for status changes

### Data Schema

**Firestore** (`/users/{userId}/games/{gameId}/gamestats`):
```json
{
  "created_at": "Timestamp",
  "initial_score": 0,
  "role": "admin",
  "roomId": "XY7Z9A"
}
```

**RTDB** (`/rooms/{roomId}`):
```json
{
  "gameId": "game_123456789",
  "roomId": "XY7Z9A",
  "status": "active",
  "roomStatus": "open",
  "createdAt": 1716900000000,
  "totalMembers": 1,
  "members": {
    "{userId}": {
      "name": "User 1234",
      "role": "host",
      "status": "online",
      "lastChanged": 1716900005000
    }
  }
}
```

## Security Rules

### Realtime Database Rules

For production, update your RTDB rules:

```json
{
  "rules": {
    "rooms": {
      ".read": true,
      ".write": "auth != null"
    }
  }
}
```

### Firestore Rules

For production, update your Firestore rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/games/{gameId}/gamestats {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Build for Production

```bash
npm run build
```

The production-ready files will be in the `dist/` directory.

## Troubleshooting

### "Permission denied" errors
- Make sure your Firebase Realtime Database and Firestore are in test mode
- Check that Authentication is enabled with Anonymous provider

### Status not updating
- Verify your Firebase Database URL is correct in `.env`
- Check browser console for any Firebase connection errors
- Ensure you're testing with actual internet disconnect (not just closing tab)

### App not loading
- Make sure all environment variables are set correctly
- Check that `npm install` completed successfully
- Try clearing browser cache and restarting dev server

## License

MIT

## Support

For issues or questions, please refer to the project specification in `projectspec.md`.
