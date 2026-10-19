import React, { useState } from 'react';
import { confirmEmailAction } from '../../actions/auth-emails';
import { LoadingButton } from '../ui/Common';

interface ConfirmEmailPageProps {
  token: string;
  email?: string;
}

export const ConfirmEmailPage: React.FC<ConfirmEmailPageProps> = ({ token, email }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await confirmEmailAction(token, email);
      if (res && res.success) {
        const targetUrl = '/prijava' + (email ? `?email=${encodeURIComponent(email)}` : '');
        window.location.replace(targetUrl);
        return;
      } else {
        setError(res?.error || 'Povezava je neveljavna ali je potekla.');
      }
    } catch (err: any) {
      setError(err?.message || 'Povezava je neveljavna ali je potekla.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A1128] flex items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col items-center">
        <LoadingButton
          onClick={handleConfirm}
          loading={loading}
          loadingText="Obdelujem..."
          className="w-full py-4 px-6 rounded-2xl bg-[#FEBA4F] text-[#0A1128] font-black uppercase tracking-wider text-sm shadow-xl hover:bg-amber-400 transition-all cursor-pointer"
        >
          {error ? 'Poskusi znova' : 'Potrdi e-poštni naslov'}
        </LoadingButton>
        {error && (
          <p className="text-red-500 text-xs font-bold text-center mt-3">
            {error}
          </p>
        )}
      </div>
    </div>
  );
};
