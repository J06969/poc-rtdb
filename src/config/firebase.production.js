// TEMPORARY: Hardcoded production config for testing
// Replace with environment variables once Cloudflare setup is working

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCis1F6iiqN9lc0oM0aZ9o57JSrNBnl8TA",
  authDomain: "tiny-entertainment.firebaseapp.com",
  databaseURL: "https://tiny-entertainment-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tiny-entertainment",
  storageBucket: "tiny-entertainment.appspot.com",
  messagingSenderId: "943665491640",
  appId: "1:943665491640:web:ecf5f9e58315a0fd17ce4d"
};

console.log('⚠️ Using hardcoded Firebase config (temporary)');

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getDatabase(app);
export const firestore = getFirestore(app);

export default app;
