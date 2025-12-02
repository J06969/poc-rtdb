import { useState, useEffect } from 'react';

export default function AfkCheckModal({ countdown, onConfirm, onTimeout }) {
  const [timeLeft, setTimeLeft] = useState(countdown);

  useEffect(() => {
    setTimeLeft(countdown);

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [countdown, onTimeout]);

  const percentage = (timeLeft / countdown) * 100;
  const isUrgent = timeLeft <= 10;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8 relative animate-bounce">
        {/* Alert Icon */}
        <div className="flex justify-center mb-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
            isUrgent ? 'bg-red-100 animate-pulse' : 'bg-yellow-100'
          }`}>
            <span className="text-4xl">⚠️</span>
          </div>
        </div>

        {/* Title */}
        <h2 className={`text-2xl font-bold text-center mb-4 ${
          isUrgent ? 'text-red-600' : 'text-gray-800'
        }`}>
          Are You Still Here?
        </h2>

        {/* Message */}
        <p className="text-gray-600 text-center mb-6">
          As the host, we need to confirm you're still active.
          Click the button below to keep this room open.
        </p>

        {/* Countdown */}
        <div className="mb-6">
          <div className="text-center mb-2">
            <span className={`text-5xl font-bold ${
              isUrgent ? 'text-red-600 animate-pulse' : 'text-yellow-600'
            }`}>
              {timeLeft}
            </span>
            <span className="text-gray-500 text-sm ml-2">seconds remaining</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ease-linear ${
                isUrgent ? 'bg-red-500' : 'bg-yellow-500'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* Confirm Button */}
        <button
          onClick={onConfirm}
          className={`w-full py-4 rounded-lg font-bold text-white text-lg transition duration-200 ${
            isUrgent
              ? 'bg-red-500 hover:bg-red-600 animate-pulse'
              : 'bg-green-500 hover:bg-green-600'
          }`}
        >
          {isUrgent ? '🚨 CONFIRM NOW!' : '✓ Yes, I\'m Here!'}
        </button>

        {/* Warning */}
        <p className="text-center text-xs text-gray-500 mt-4">
          If you don't respond, this room will be automatically closed and all members will be disconnected.
        </p>
      </div>
    </div>
  );
}
