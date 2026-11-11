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
    <div className="inline-flex items-center gap-2 text-white font-bold text-xl sm:text-2xl tabular-nums">
      <Clock size={18} className="text-[#FEBA4F]" /><span>{timeLeftStr}</span>
    </div>
  );
};
