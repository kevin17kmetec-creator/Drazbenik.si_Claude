import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { formatSeconds } from "../../lib/utils";

export const StaticTimer: React.FC<{ endTime: Date }> = ({ endTime }) => {
  const [timeLeftStr, setTimeLeftStr] = useState('');
  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Math.floor((endTime.getTime() - Date.now()) / 1000));
      setTimeLeftStr(formatSeconds(diff));
    };
    update(); const t = setInterval(update, 1000); return () => clearInterval(t);
  }, [endTime]);
  return (
    <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl border-2 bg-[#FEBA4F]/10 border-[#FEBA4F]/30 text-[#FEBA4F] font-mono font-black text-2xl tabular-nums shadow-xl">
      <Clock size={20} /><span>{timeLeftStr}</span>
    </div>
  );
};
