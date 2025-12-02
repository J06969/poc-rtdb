import { useState } from 'react';
import { signInAnonymous } from '../services/auth';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAnonymousLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await signInAnonymous();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-800 mb-2 text-center">
          Realtime Game Sync POC
        </h1>
        <p className="text-gray-600 mb-8 text-center">
          Firebase RTDB Presence Demo
        </p>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handleAnonymousLogin}
          disabled={loading}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Signing in...' : 'Sign in Anonymously'}
        </button>

        <div className="mt-8 text-xs text-gray-500 text-center">
          <p>This POC demonstrates Firebase RTDB presence detection</p>
          <p className="mt-1">Open multiple browsers to test real-time sync</p>
        </div>
      </div>
    </div>
  );
}
