import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

let portalMountCount = 0;
let previousOverflow = '';

export interface PortalProps {
  children: React.ReactNode;
}

export const Portal: React.FC<PortalProps> = ({ children }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    if (portalMountCount === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    portalMountCount++;

    return () => {
      portalMountCount--;
      if (portalMountCount <= 0) {
        portalMountCount = 0;
        document.body.style.overflow = previousOverflow || '';
      }
    };
  }, []);

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(children, document.body);
};
