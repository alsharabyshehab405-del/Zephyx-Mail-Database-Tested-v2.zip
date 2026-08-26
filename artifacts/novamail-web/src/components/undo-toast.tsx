import React, { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";

interface UndoToastProps {
  durationSeconds?: number;
  onUndo: () => void;
  onClose: () => void;
}

export const UndoToast: React.FC<UndoToastProps> = ({
  durationSeconds = 10,
  onUndo,
  onClose,
}) => {
  const [timeLeft, setTimeLeft] = useState(Math.max(5, Math.min(30, durationSeconds)));

  useEffect(() => {
    if (timeLeft <= 0) {
      onClose();
      return;
    }

    const timer = window.setTimeout(() => setTimeLeft((previous) => previous - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [timeLeft, onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      dir="rtl"
      className="fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-white shadow-2xl animate-slide-up"
    >
      <span className="text-sm">تم إرسال الرسالة ({timeLeft} ثانية)</span>
      <button
        type="button"
        onClick={onUndo}
        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        <span>تراجع</span>
      </button>
    </div>
  );
};

export default UndoToast;
