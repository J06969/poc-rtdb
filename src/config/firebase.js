import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';

// Fallback to hardcoded values if env vars not available (Cloudflare Pages issue)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCis1F6iiqN9lc0oM0aZ9o57JSrNBnl8TA",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "tiny-entertainment.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://tiny-entertainment-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "tiny-entertainment",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "tiny-entertainment.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "943665491640",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:943665491640:web:ecf5f9e58315a0fd17ce4d"
};

// Debug: Log config source
const usingEnvVars = !!import.meta.env.VITE_FIREBASE_API_KEY;
console.log(`🔥 Firebase initialized using ${usingEnvVars ? 'environment variables' : 'fallback values'}`);

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getDatabase(app);
export const firestore = getFirestore(app);

export default app;
