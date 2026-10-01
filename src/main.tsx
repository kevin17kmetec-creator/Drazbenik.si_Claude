
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

// =========================================================================
// GLOBAL ERROR HANDLERS & SENTRY NOISE REDUCTION
// =========================================================================

// Catch unhandled promise rejections (e.g. from MetaMask)
window.addEventListener('unhandledrejection', (event) => {
    const errorMsg = event.reason?.message || String(event.reason);
    if (
        errorMsg.includes('tabs:outgoing.message.ready') || 
        errorMsg.includes('SES') ||
        errorMsg.includes('MetaMask') ||
        errorMsg.includes('lockdown')
    ) {
        event.preventDefault();
        event.stopImmediatePropagation();
    }
}, true); // Use capture phase to catch it early

// Catch uncaught errors
window.addEventListener('error', (event) => {
    const errorMsg = event.message || '';
    if (
        errorMsg.includes('tabs:outgoing.message.ready') ||
        errorMsg.includes('SES') ||
        errorMsg.includes('MetaMask') ||
        errorMsg.includes('lockdown')
    ) {
        event.preventDefault();
        event.stopImmediatePropagation();
    }
}, true); // Use capture phase to catch it early

// Overwrite/Initialize global Sentry to enforce sampling and filtering
const NOISE_KEYWORDS = ['tabs:outgoing.message.ready', 'SES', 'MetaMask', 'lockdown'];

(window as any).Sentry = (window as any).Sentry || {};
const originalInit = (window as any).Sentry.init;

(window as any).Sentry.init = function (options: any = {}) {
    options.tracesSampleRate = 0.1;
    options.sampleRate = 0.2;
    
    const originalBeforeSend = options.beforeSend;
    options.beforeSend = (event: any, hint: any) => {
        const errorMsg = hint?.originalException?.message || String(hint?.originalException) || '';
        if (NOISE_KEYWORDS.some(keyword => errorMsg.includes(keyword))) {
            return null; // Drop the event
        }
        if (originalBeforeSend) {
            return originalBeforeSend(event, hint);
        }
        return event;
    };

    if (originalInit) {
        return originalInit.call(this, options);
    }
};

// Also silence them in console.error to keep the developer console completely clean
const originalConsoleError = console.error;
console.error = function (...args) {
    const msg = args.map(a => typeof a === 'string' ? a : (a?.message || '')).join(' ');
    if (NOISE_KEYWORDS.some(keyword => msg.includes(keyword)) || msg.includes('429')) {
        return; // Silent drop
    }
    originalConsoleError.apply(console, args);
};

// =========================================================================

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', fontFamily: 'sans-serif', color: 'red' }}>
          <h2>Nekaj je šlo narobe. (Something went wrong.)</h2>
          <pre style={{ background: '#f5f5f5', padding: '20px', borderRadius: '8px', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {this.state.error?.message}
            <br />
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

if (!siteKey) {
  console.warn("[reCAPTCHA] NEXT_PUBLIC_RECAPTCHA_SITE_KEY is missing in Environment Variables.");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
