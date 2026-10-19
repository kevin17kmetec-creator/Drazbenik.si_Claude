import React, { useState, useEffect } from 'react';
import { Clock } from '../icons';
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
    <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-[#FEBA4F]/50 bg-[#FEBA4F]/10 text-[#FEBA4F] font-bold text-2xl sm:text-3xl tabular-nums tracking-wide">
      <Clock size={24} /><span>{timeLeftStr}</span>
    </div>
  );
};
