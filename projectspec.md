Project Specification: Realtime Game Sync POC

1. Executive Summary

This project is a Proof of Concept (POC) designed to validate the capability of Firebase Realtime Database (RTDB) to trigger frontend updates in a game environment. The core objective is to demonstrate a hybrid database architecture where "hot" data (presence, lobby state) lives in RTDB, and "persistent" data (game stats) lives in Firestore.

2. Technical Requirements

2.1. Frontend

Framework: React (Single Page Application)

State Management: React Hooks (useState, useEffect)

Styling: Tailwind CSS

2.2. Backend / Infrastructure (Firebase)

Authentication: Firebase Auth (Anonymous Login + Custom Token support).

Realtime Database (RTDB): Used for ephemeral data, high-frequency updates, and presence (online/offline) detection.

Cloud Firestore: Used for persistent, historical data storage.

3. Functional Specifications

3.1. Authentication

User logs in automatically via Firebase Auth.

Supports signInAnonymously for quick testing.

Supports signInWithCustomToken for integration with existing backends.

3.2. Game Room Creation

User can create a new room.

Action 1 (Firestore): A permanent record is created for the user's game history.

Action 2 (RTDB): A live room lobby is initialized.

Action 3 (UI): User is automatically joined as "Host" and navigated to the room view.

3.3. Presence System ("The Ping")

Requirement: Check "ping" or online status for each user.

Implementation:

Client-side: Listen to .info/connected to detect local connection state.

Server-side: Use Firebase onDisconnect() primitive.

Behavior:

If a user loses internet or closes the tab, the RTDB entry automatically updates to offline.

If a user reconnects, the entry updates to online.

No manual HTTP polling or interval "pings" required.

4. Data Schema

4.1. Firestore (Persistent Data)

Path: /users/{userId}/games/{gameId}/gamestats

Purpose: Long-term storage of game results and stats.

{
  "created_at": "Timestamp",
  "initial_score": 0,
  "role": "admin",
  "roomId": "XY7Z9A" // Link to the RTDB room
}


4.2. Realtime Database (Hot Data)

Path: /rooms/{roomId}

Purpose: Live game state, lobby membership, and connection status.

{
  "gameId": "game_123456789", // Reference to Firestore ID
  "roomId": "XY7Z9A",
  "status": "active",         // active, inactive
  "roomStatus": "open",       // open, close
  "createdAt": 1716900000000,
  "totalMembers": 1,
  "members": {
    "{userId}": {
      "name": "User 1234",
      "role": "host",         // host, player
      "status": "online",     // online, offline (Crucial for POC)
      "lastChanged": 1716900005000
    }
  }
}


5. Development Roadmap

Phase 1: Setup

Initialize Firebase Project.

Enable Authentication (Anonymous).

Create Realtime Database (Start in test mode).

Create Firestore Database.

Phase 2: Implementation

Auth Layer: specific code to handle user ID generation.

Presence Hook: Create usePresence hook to bind .info/connected to user status.

Lobby Logic: Functions to write to both DBs simultaneously (createGameRoom).

Sync Logic: onValue listeners on /rooms/{roomId} to render UI updates.

Phase 3: Verification (The Proof)

Open two browsers.

User A creates room.

User B joins room.

User B disconnects network.

Pass Criteria: User A sees User B's dot turn red within 2-5 seconds.

6. Security Rules (Basic Draft)

Realtime Database Rules:

{
  "rules": {
    "rooms": {
      ".read": true,
      ".write": "auth != null"
    }
  }
}


Firestore Rules:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/games/{gameId}/gamestats {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
