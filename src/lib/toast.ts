import React from 'react';
import { toast as originalToast, ExternalToast } from 'sonner';

let lastToastMsg = "";
let lastToastTime = 0;

const shouldShow = (msg: string | React.ReactNode) => {
  const msgStr = typeof msg === 'string' ? msg : String(msg);
  const now = Date.now();
  if (msgStr === lastToastMsg && now - lastToastTime < 2500) {
    return false;
  }
  lastToastMsg = msgStr;
  lastToastTime = now;
  return true;
};

// Wrap the toast functions
export const toast = Object.assign(
  (message: string | React.ReactNode, data?: ExternalToast) => {
    if (shouldShow(message)) {
      return originalToast(message, data);
    }
  },
  {
    success: (message: string | React.ReactNode, data?: ExternalToast) => {
      if (shouldShow(message)) {
        return originalToast.success(message, data);
      }
    },
    error: (message: string | React.ReactNode, data?: ExternalToast) => {
      if (shouldShow(message)) {
        return originalToast.error(message, data);
      }
    },
    info: (message: string | React.ReactNode, data?: ExternalToast) => {
      if (shouldShow(message)) {
        return originalToast.info(message, data);
      }
    },
    warning: (message: string | React.ReactNode, data?: ExternalToast) => {
      if (shouldShow(message)) {
        return originalToast.warning(message, data);
      }
    },
    loading: (message: string | React.ReactNode, data?: ExternalToast) => {
        return originalToast.loading(message, data); // Don't dedupe loading
    },
    dismiss: originalToast.dismiss,
    promise: originalToast.promise,
  }
);
