import { signInAnonymously, signInWithCustomToken, signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '../config/firebase';

/**
 * Sign in anonymously
 * @returns {Promise<Object>} User credential
 */
export async function signInAnonymous() {
  try {
    const userCredential = await signInAnonymously(auth);
    return userCredential;
  } catch (error) {
    console.error('Error signing in anonymously:', error);
    throw error;
  }
}

/**
 * Sign in with custom token
 * @param {string} customToken - Custom token from backend
 * @returns {Promise<Object>} User credential
 */
export async function signInWithToken(customToken) {
  try {
    const userCredential = await signInWithCustomToken(auth, customToken);
    return userCredential;
  } catch (error) {
    console.error('Error signing in with custom token:', error);
    throw error;
  }
}

/**
 * Sign out current user
 * @returns {Promise<void>}
 */
export async function signOut() {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
}
