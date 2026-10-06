import React, { useState, useEffect } from 'react';
import { User, CheckCircle2, AlertCircle, ShieldCheck, XCircle, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { auth, db, safeSignOut, setRegisteringAuth } from "../../lib/firebase";
import { doc, getDoc } from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { toast } from 'sonner';
import { getAuthHeaders } from '../../lib/authFetch';
import { TERMS_VERSION } from '../../lib/termsVersion';
import { sendEmailVerificationAction, sendPasswordResetAction } from "../../actions/auth-emails";
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { verifyCaptchaAction } from '../../actions/captcha';
import { friendlyError } from '../../lib/friendlyError';

export const AuthView: React.FC<{ 
  t: any; 
  onLoginSuccess: () => void; 
  setIsVerified: (v: boolean) => void; 
  setAppLoggedIn: (val: boolean) => void;
  initialMode?: 'login' | 'register';
  onLegal?: (type: 'terms' | 'privacy' | 'how') => void;
  onAcceptTerms?: () => void;
}> = ({ t, onLoginSuccess, setIsVerified, setAppLoggedIn, initialMode = 'login', onLegal, onAcceptTerms }) => {
  const { executeRecaptcha } = useGoogleReCaptcha();
  const [isLogin, setIsLogin] = useState(initialMode !== 'register');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password visibility state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Unverified email / resend state
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Password validation state
  const [hasUppercase, setHasUppercase] = useState(false);
  const [hasNumber, setHasNumber] = useState(false);
  const [hasMinLength, setHasMinLength] = useState(false);
  const [passwordsMatch, setPasswordsMatch] = useState(true);

  useEffect(() => {
    setHasUppercase(/[A-Z]/.test(password));
    setHasNumber(/[0-9]/.test(password));
    setHasMinLength(password.length >= 8);
    setPasswordsMatch(password === confirmPassword || confirmPassword === '');
  }, [password, confirmPassword]);

  const getPasswordStrength = () => {
    let strength = 0;
    if (hasUppercase) strength++;
    if (hasNumber) strength++;
    if (hasMinLength) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++; // Special char bonus
    return strength;
  };

  const strength = getPasswordStrength();
  const strengthColor = strength <= 1 ? 'bg-red-500' : strength === 2 ? 'bg-amber-500' : strength === 3 ? 'bg-green-400' : 'bg-green-600';
  const strengthText = strength <= 1 ? t('weak') : strength === 2 ? t('moderate') : strength === 3 ? t('good') : t('excellent');

  const handleResendVerification = async () => {
    const targetEmail = (unverifiedEmail || email || '').trim();
    if (!targetEmail) {
      toast.error("Vnesite svoj e-poštni naslov za ponovno pošiljanje.");
      return;
    }
    setResendingVerification(true);
    try {
      if (executeRecaptcha) {
        try {
          const token = await executeRecaptcha('register');
          const captchaRes = await verifyCaptchaAction(token, 'register');
          if (!captchaRes.success) {
            toast.error(friendlyError(captchaRes.error, "Preverjanje reCAPTCHA ni uspelo. Prosimo, poskusite znova."));
            setResendingVerification(false);
            return;
          }
        } catch (e) {
          console.warn("reCAPTCHA execution error:", e);
        }
      }

      const res = await sendEmailVerificationAction(targetEmail, targetEmail.split('@')[0]);
      if (res.success) {
        toast.success("Novo potrditveno sporočilo je bilo uspešno odposlano! Preverite svoj e-poštni predal (tudi mapo z vsiljeno pošto).");
      } else {
        toast.error(friendlyError(res.error, "Napaka pri pošiljanju potrditvenega sporočila. Prosimo, poskusite ponovno čez nekaj trenutkov."));
      }
    } catch (err: any) {
      toast.error(friendlyError(err, "Napaka pri povezavi. Poskusite znova."));
    } finally {
      setResendingVerification(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) return toast.error(t("missingFields") || "Manjkajoči podatki.");
    
    if (!isLogin) {
        if (!hasUppercase || !hasNumber || !hasMinLength) {
            return toast.error(t("passwordRequirements") || "Geslo ne ustreza zahtevam.");
        }
        if (password !== confirmPassword) {
            setPasswordsMatch(false);
            return toast.error(t("passwordsNotMatch") || "Gesli se ne ujemata.");
        }
    }
    
    setLoading(true);
    try {
      if (isLogin) {
          if (executeRecaptcha) {
            try {
              const token = await executeRecaptcha('login');
              const captchaRes = await verifyCaptchaAction(token, 'login');
              if (!captchaRes.success) {
                toast.error(friendlyError(captchaRes.error, "Preverjanje reCAPTCHA ni uspelo. Prosimo, poskusite znova."));
                setLoading(false);
                return;
              }
            } catch (e) {
              console.warn("reCAPTCHA execution error:", e);
            }
          }

          const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
          const user = cred.user;
          
          let isEmailConfirmed = user.emailVerified;
          if (!isEmailConfirmed) {
            try {
              const userDoc = await getDoc(doc(db, "users", user.uid));
              if (userDoc.exists()) {
                const data = userDoc.data();
                if (data.email_verified === true || data.is_verified === true || data.registration_confirmed === true) {
                  isEmailConfirmed = true;
                }
              }
            } catch (e) {
              console.warn("Preverjanje uporabnika v bazi:", e);
            }
          }

          if (!isEmailConfirmed) {
              setUnverifiedEmail(cleanEmail);
              await safeSignOut(auth);
              toast.error("Vaš e-poštni naslov še ni potrjen! Registracija še ni zaključena. Prosimo, preverite svojo e-pošto in kliknite na potrditveni gumb.");
              setLoading(false);
              return;
          }

          setUnverifiedEmail(null);

          // E-pošta JE potrjena! Posodobimo uporabniški račun preko strežnika:
          if (user && (auth.currentUser?.emailVerified || user.emailVerified)) {
              try {
                  if (rememberMe) {
                      localStorage.setItem('remember_me', 'true');
                  } else {
                      localStorage.removeItem('remember_me');
                  }
                  await fetch('/api/profile/init', {
                      method: 'POST',
                      headers: await getAuthHeaders()
                  });
              } catch (e) {
                  console.warn("Profile init error:", e);
              }
          }
          toast.success("Prijava uspešna!");
          onLoginSuccess();
       } else {
          // REGISTRACIJA
          setRegisteringAuth(true);
          try {
            if (executeRecaptcha) {
              try {
                const token = await executeRecaptcha('register');
                const captchaRes = await verifyCaptchaAction(token, 'register');
                if (!captchaRes.success) {
                  toast.error(friendlyError(captchaRes.error, "Preverjanje reCAPTCHA ni uspelo. Prosimo, poskusite znova."));
                  setRegisteringAuth(false);
                  setLoading(false);
                  return;
                }
              } catch (e) {
                console.warn("reCAPTCHA execution error:", e);
              }
            }

            // 1. Ustvari uporabnika v Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
            const user = userCredential.user;

            // 2. Inicializiramo račun preko strežniške poti, dokler je seansa aktivna
            try {
              await fetch('/api/profile/init', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                  accepted_terms: true,
                  terms_version: TERMS_VERSION
                })
              });
            } catch (dbErr) {
              console.warn("Napaka pri inicializaciji uporabnika:", dbErr);
            }

            // 3. Pošiljanje verifikacijskega sporočila izključno preko našega Resend strežniškega sistema
            const emailRes = await sendEmailVerificationAction(cleanEmail, cleanEmail.split('@')[0], user.uid);

            // 4. Varno odjavi uporabnika, saj račun še ni potrjen
            try {
              await safeSignOut(auth);
            } catch (signOutErr) {
              console.warn("Sign out po registraciji opozorilo:", signOutErr);
            }

            // 5. Preklopi na vmesnik za prijavo z navodilom za potrditev
            setUnverifiedEmail(cleanEmail);
            setIsLogin(true);
            setPassword('');
            setConfirmPassword('');

            if (emailRes.success) {
              toast.success("Račun je uspešno ustvarjen! Na vaš e-poštni naslov smo poslali sporočilo s potrditvenim gumbom. Pred prvo prijavo preverite svoj predal in potrdite naslov.");
            } else {
              toast.error(friendlyError(emailRes.error, "Račun je bil ustvarjen, vendar e-pošte ni bilo mogoče odposlati. Uporabite spodnji gumb za ponovno pošiljanje."));
            }
          } catch (authError: any) {
            console.error("Registracija spodletela:", authError);
            const errorCode = authError.code || "";
            if (errorCode === "auth/email-already-in-use") {
              toast.error("Ta e-poštni naslov je že registriran. Prosimo, prijavite se ali obnovite geslo.");
              setIsLogin(true);
              setPassword('');
              setConfirmPassword('');
            } else if (errorCode === "auth/weak-password") {
              toast.error("Geslo je prešibko. Vsebovati mora vsaj 6 znakov.");
            } else if (errorCode === "auth/invalid-email") {
              toast.error("Vnesite veljaven e-poštni naslov.");
            } else {
              toast.error(friendlyError(authError, "Registracija ni uspela. Poskusite znova."));
            }
          } finally {
            setRegisteringAuth(false);
          }
       }
    } catch (error: any) {
        let errorCode = error.code || "";
        let errorMsg = error.message || JSON.stringify(error);
        
        if (
            errorCode === "auth/user-not-found" || 
            errorCode === "auth/wrong-password" || 
            errorCode === "auth/invalid-credential" ||
            errorMsg.includes("Invalid login credentials") ||
            errorMsg.includes("invalid-credential")
        ) {
            toast.error("Prijavni podatki ne obstajajo ali pa so nepravilni.");
        } else if (errorCode === "auth/email-already-in-use") {
            toast.error("Ta e-poštni naslov je že registriran. Če še niste potrdili naslova, se poskusite prijaviti ali zahtevajte ponovno pošiljanje povezave.");
            setIsLogin(true);
        } else {
            toast.error(friendlyError(error, "Prijava ni uspela. Poskusite znova."));
        }
    } finally { 
        setRegisteringAuth(false);
        setLoading(false); 
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      
      const res = await fetch('/api/profile/init', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          // We don't send accepted_terms: true here because we want to force the redirect if it's a new user
          // Actually, if it's a new user, they MUST see the terms screen.
        })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        if (res.status === 400 && onAcceptTerms) {
          // New user or missing terms
          onAcceptTerms();
          return;
        }
        console.warn("Profile init error:", errData.error);
      }
      
      onLoginSuccess();
    } catch (error: any) {
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
        // No toast when popup was closed or cancelled by user
      } else if (error?.code === 'auth/account-exists-with-different-credential') {
        toast.error("Za ta e-poštni naslov že obstaja račun z geslom. Prijavite se z e-pošto in geslom, nato v Nastavitvah povežite Google račun.");
      } else {
        toast.error(friendlyError(error, "Prijava z Google računom ni uspela. Poskusite znova."));
      }
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email) return toast.error(t('emailRequired') || 'Manjka e-poštni naslov');
      
      setLoading(true);
      try {
          if (executeRecaptcha) {
            try {
              const token = await executeRecaptcha('password_reset');
              const captchaRes = await verifyCaptchaAction(token, 'password_reset');
              if (!captchaRes.success) {
                toast.error(friendlyError(captchaRes.error, "Preverjanje reCAPTCHA ni uspelo. Prosimo, poskusite znova."));
                setLoading(false);
                return;
              }
            } catch (e) {
              console.warn("reCAPTCHA execution error:", e);
            }
          }

          let resetSuccess = false;
          try {
            const res = await sendPasswordResetAction(email);
            if (res.success) resetSuccess = true;
          } catch (e) {}

          if (!resetSuccess) {
            try {
              await sendPasswordResetEmail(auth, email);
              resetSuccess = true;
            } catch (fbErr: any) {
              throw new Error(fbErr.message || "Napaka pri pošiljanju ponastavitvene e-pošte");
            }
          }
          
          toast.success(t('resetLinkSent') || 'Povezava za ponastavitev je poslana na vaš e-mail.');
          setIsForgotPassword(false);
      } catch (error: any) {
        toast.error(friendlyError(error, "Napaka pri ponastavitvi gesla. Poskusite znova."));
      } finally { setLoading(false); }
  };

  if (isForgotPassword) {
      return (
        <div className="max-w-[1600px] mx-auto px-6 py-20 animate-in flex justify-center">
          <div className="bg-white w-full max-w-xl rounded-[4rem] p-10 lg:p-16 shadow-2xl border border-slate-100">
            <button onClick={() => setIsForgotPassword(false)} className="flex items-center gap-2 text-slate-400 mb-8 font-black uppercase text-[10px] tracking-widest hover:text-[#0A1128] transition-colors"><ArrowLeft size={16}/> {t('backToLogin')}</button>
            <div className="text-center mb-10">
                <div className="bg-[#FEBA4F] w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-lg"><ShieldCheck size={40} className="text-[#0A1128]" /></div>
                <h2 className="text-4xl font-black text-[#0A1128] uppercase tracking-tighter mb-4">{t('forgotPassword')}</h2>
                <p className="text-slate-400 font-bold text-sm">{t('forgotPasswordDesc')}</p>
            </div>
            <form onSubmit={handleForgotPassword} className="space-y-6">
              <input type="email" required className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 font-bold focus:ring-2 focus:ring-[#FEBA4F] outline-none" placeholder={t('email')} onChange={e => setEmail(e.target.value)} />
              <button type="submit" disabled={loading} className="w-full bg-[#0A1128] text-white py-6 rounded-[2rem] font-black uppercase tracking-widest hover:bg-[#FEBA4F] transition-all shadow-xl">{loading ? t('processing') : t('sendLink')}</button>
            </form>
          </div>
        </div>
      );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-20 animate-in flex justify-center">
      <div className="bg-white w-full max-w-xl rounded-[4rem] p-10 lg:p-16 shadow-2xl border border-slate-100">
        <div className="text-center mb-10">
            <div className="bg-[#FEBA4F] w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-lg"><User size={40} className="text-[#0A1128]" /></div>
            <h2 className="text-4xl font-black text-[#0A1128] uppercase tracking-tighter mb-4">{isLogin ? t('login') : t('register')}</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6 mb-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-2xl text-sm font-bold flex items-center gap-2">
              <AlertCircle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {unverifiedEmail && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-2xl text-xs font-bold space-y-2">
              <p>Čakate na potrditev e-poštnega naslova za <strong>{unverifiedEmail}</strong>. Pred prijavo potrdite svoj naslov preko prejete povezave.</p>
              <button
                type="button"
                disabled={resendingVerification}
                onClick={handleResendVerification}
                className="text-[#0A1128] underline hover:text-[#FEBA4F] font-black uppercase tracking-wider transition-colors disabled:opacity-50"
              >
                {resendingVerification ? "Pošiljam..." : "Pošlji potrditveno povezavo ponovno"}
              </button>
            </div>
          )}

          <input type="email" required className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 font-bold focus:ring-2 focus:ring-[#FEBA4F] outline-none" placeholder={t('email')} value={email} onChange={e => setEmail(e.target.value)} />
          
          <div className="space-y-2">
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  required 
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-6 pr-14 font-bold focus:ring-2 focus:ring-[#FEBA4F] outline-none" 
                  placeholder={t('password')} 
                  value={password}
                  onChange={e => setPassword(e.target.value)} 
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-[#0A1128] transition-colors focus:outline-none"
                  aria-label={showPassword ? "Skrij geslo" : "Pokaži geslo"}
                  title={showPassword ? "Skrij geslo" : "Pokaži geslo"}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              
              {!isLogin && password.length > 0 && (
                  <div className="px-2 animate-in fade-in slide-in-from-top-2">
                      <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-slate-500">{t('strength')}:</span>
                          <span className={`text-xs font-black uppercase tracking-widest ${strength <= 1 ? 'text-red-500' : strength === 2 ? 'text-amber-500' : 'text-green-600'}`}>{strengthText}</span>
                      </div>
                      <div className="flex gap-1 h-1.5 mb-4">
                          <div className={`flex-1 rounded-full ${password.length > 0 ? strengthColor : 'bg-slate-100'}`}></div>
                          <div className={`flex-1 rounded-full ${strength >= 2 ? strengthColor : 'bg-slate-100'}`}></div>
                          <div className={`flex-1 rounded-full ${strength >= 3 ? strengthColor : 'bg-slate-100'}`}></div>
                          <div className={`flex-1 rounded-full ${strength >= 4 ? strengthColor : 'bg-slate-100'}`}></div>
                      </div>
                      
                      <div className="space-y-1.5 text-xs font-bold">
                          <div className={`flex items-center gap-2 ${hasMinLength ? 'text-green-600' : 'text-slate-400'}`}>
                              {hasMinLength ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {t('min8chars')}
                          </div>
                          <div className={`flex items-center gap-2 ${hasUppercase ? 'text-green-600' : 'text-slate-400'}`}>
                              {hasUppercase ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {t('oneUpper')}
                          </div>
                          <div className={`flex items-center gap-2 ${hasNumber ? 'text-green-600' : 'text-slate-400'}`}>
                              {hasNumber ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {t('oneNumber')}
                          </div>
                      </div>
                  </div>
              )}
          </div>

          {!isLogin && (
              <div className="space-y-2">
                  <div className="relative">
                    <input 
                        type={showConfirmPassword ? "text" : "password"} 
                        required 
                        className={`w-full bg-slate-50 border ${!passwordsMatch ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 focus:ring-[#FEBA4F]'} rounded-2xl py-4 pl-6 pr-14 font-bold focus:ring-2 outline-none`} 
                        placeholder={t('confirmPassword')} 
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)} 
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowConfirmPassword(prev => !prev)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-[#0A1128] transition-colors focus:outline-none"
                      aria-label={showConfirmPassword ? "Skrij geslo" : "Pokaži geslo"}
                      title={showConfirmPassword ? "Skrij geslo" : "Pokaži geslo"}
                    >
                      {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  {!passwordsMatch && <p className="text-red-500 text-xs font-bold px-2">{t('passwordsNotMatch')}</p>}
              </div>
          )}

          {isLogin && (
              <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                      <input 
                          type="checkbox" 
                          id="rememberMe" 
                          checked={rememberMe} 
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="w-4 h-4 text-[#FEBA4F] bg-slate-50 border-slate-200 rounded focus:ring-[#FEBA4F] cursor-pointer"
                      />
                      <label htmlFor="rememberMe" className="text-xs font-bold text-slate-500 cursor-pointer">{t('rememberMe')}</label>
                  </div>
                  <button type="button" onClick={() => setIsForgotPassword(true)} className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-[#0A1128] transition-colors">{t('forgotPasswordQuestion')}</button>
              </div>
          )}

          {!isLogin && (
            <div className="flex items-start gap-2 px-2 mt-2">
              <input 
                type="checkbox" 
                id="acceptTerms" 
                required
                className="w-4 h-4 mt-1 text-[#FEBA4F] bg-slate-50 border-slate-200 rounded focus:ring-[#FEBA4F] cursor-pointer"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
              />
              <label htmlFor="acceptTerms" className="text-xs font-bold text-slate-500 cursor-pointer">
                Sprejemam <button type="button" onClick={() => onLegal?.('terms')} className="text-[#0A1128] underline hover:text-[#FEBA4F]">Pogoje uporabe</button> in <button type="button" onClick={() => onLegal?.('privacy')} className="text-[#0A1128] underline hover:text-[#FEBA4F]">Politiko zasebnosti</button>.
              </label>
            </div>
          )}

          <button type="submit" disabled={loading || (!isLogin && !acceptTerms)} className="w-full bg-[#0A1128] text-white py-6 rounded-[2rem] font-black uppercase tracking-widest hover:bg-[#FEBA4F] transition-all shadow-xl flex items-center justify-center gap-3">
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                {t('processing')}
              </>
            ) : (
              isLogin ? t('login') : t('createAccount')
            )}
          </button>
          
          {isLogin && (
            <div className="relative flex items-center justify-center py-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
              <span className="relative bg-white px-4 text-[10px] font-black text-slate-300 uppercase tracking-widest">{t('or')}</span>
            </div>
          )}

          {isLogin && (
            <button 
              type="button" 
              onClick={handleGoogleLogin} 
              disabled={loading}
              className="w-full bg-white border-2 border-slate-100 text-[#0A1128] py-5 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:border-[#FEBA4F] transition-all flex items-center justify-center gap-3 shadow-sm"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1 .67-2.28 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {t('googleLogin')}
            </button>
          )}

          <button type="button" onClick={() => { setIsLogin(!isLogin); setPassword(''); setConfirmPassword(''); }} className="w-full text-xs font-black uppercase tracking-widest text-slate-400 hover:text-[#0A1128] mt-4">{isLogin ? t('noAccountRegister') : t('haveAccountLogin')}</button>
        </form>
        </div>
    </div>
  );
};
