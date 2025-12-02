import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../config/firebase';

/**
 * Custom hook to monitor Firebase RTDB connection status
 * @returns {Object} Connection status and ping timestamp
 */
export function useConnectionStatus() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastPing, setLastPing] = useState(null);

  useEffect(() => {
    // Reference to Firebase's built-in connection status
    const connectedRef = ref(db, '.info/connected');

    const unsubscribe = onValue(connectedRef, (snapshot) => {
      const connected = snapshot.val();
      setIsConnected(connected);
      if (connected) {
        setLastPing(new Date());
      }
    });

    return () => unsubscribe();
  }, []);

  return { isConnected, lastPing };
}
