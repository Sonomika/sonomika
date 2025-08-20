import React, { useEffect, useState } from 'react';
import { getSupabase } from '../lib/supabaseClient';
import { Button, Card, CardHeader, CardTitle, CardContent, Input, Label } from './ui';

type Props = { children: React.ReactNode };

export const AuthGate: React.FC<Props> = ({ children }) => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resetMode, setResetMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetRequestMode, setResetRequestMode] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    const init = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        setUser(data.user ?? null);
      } finally {
        setLoading(false);
      }
    };
    init();
    const { data: sub } = supabase.auth.onAuthStateChange((evt, session) => {
      if (evt === 'PASSWORD_RECOVERY') {
        setResetMode(true);
      }
      setUser(session?.user ?? null);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const handleEmailPassword = async (mode: 'signup' | 'signin') => {
    setError(null);
    try {
      const supabase = getSupabase();
      if (mode === 'signup') {
        const { error: e } = await supabase.auth.signUp({ email, password });
        if (e) throw e;
      } else {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
      }
    } catch (e: any) {
      setError(e?.message || 'Authentication error');
    }
  };

  const handleMagicLink = async () => {
    setError(null);
    try {
      const supabase = getSupabase();
      const { error: e } = await supabase.auth.signInWithOtp({ email });
      if (e) throw e;
      setInfo('Magic link sent. Check your email.');
    } catch (e: any) {
      setError(e?.message || 'Magic link error');
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setInfo(null);
    try {
      if (!email) {
        // If email isn't filled yet, show a dedicated email prompt
        setResetRequestMode(true);
        return;
      }
      const supabase = getSupabase();
      const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (e) throw e;
      setInfo('Password reset email sent. Check your inbox.');
    } catch (e: any) {
      setError(e?.message || 'Failed to send reset email');
    }
  };

  const handleUpdatePassword = async () => {
    setError(null);
    setInfo(null);
    try {
      if (!newPassword || newPassword.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      const supabase = getSupabase();
      const { error: e } = await supabase.auth.updateUser({ password: newPassword });
      if (e) throw e;
      setInfo('Password updated. You can now sign in.');
      setResetMode(false);
      setNewPassword('');
    } catch (e: any) {
      setError(e?.message || 'Failed to update password');
    }
  };

  if (loading) return null;
  if (user && !resetMode) return <>{children}</>;

  return (
    <div className="tw-h-screen tw-w-full tw-flex tw-items-center tw-justify-center tw-bg-black tw-text-white">
      <Card className="tw-w-[380px] tw-bg-neutral-900 tw-border-neutral-800">
        <CardHeader>
          <CardTitle className="tw-text-white">{resetMode ? 'Reset your password' : 'Sign in to continue'}</CardTitle>
        </CardHeader>
        <CardContent className="tw-space-y-3">
          {resetMode ? (
            <>
              <div className="tw-space-y-1">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" />
              </div>
              {error && <div className="tw-text-red-400 tw-text-sm">{error}</div>}
              {info && <div className="tw-text-green-400 tw-text-sm">{info}</div>}
              <div className="tw-flex tw-gap-2">
                <Button onClick={handleUpdatePassword} className="tw-flex-1">Update password</Button>
              </div>
            </>
          ) : resetRequestMode ? (
            <>
              <div className="tw-space-y-1">
                <Label htmlFor="reset-email">Email</Label>
                <Input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onInput={(e: any) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
              </div>
              {error && <div className="tw-text-red-400 tw-text-sm">{error}</div>}
              {info && <div className="tw-text-green-400 tw-text-sm">{info}</div>}
              <div className="tw-flex tw-gap-2">
                <Button onClick={handleForgotPassword} className="tw-flex-1">Send reset email</Button>
                <Button variant="secondary" className="tw-flex-1" onClick={() => { setResetRequestMode(false); setError(null); setInfo(null); }}>Back</Button>
              </div>
            </>
          ) : (
            <>
              <div className="tw-space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onInput={(e: any) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
              </div>
              <div className="tw-space-y-1">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
              </div>
              {error && <div className="tw-text-red-400 tw-text-sm">{error}</div>}
              {info && <div className="tw-text-green-400 tw-text-sm">{info}</div>}
              <div className="tw-flex tw-gap-2">
                <Button onClick={() => handleEmailPassword('signin')} className="tw-flex-1">Sign in</Button>
                <Button variant="default" onClick={() => handleEmailPassword('signup')} className="tw-flex-1">Sign up</Button>
              </div>
              <div className="tw-flex tw-justify-between">
                <Button variant="ghost" onClick={handleMagicLink}>Send magic link</Button>
                <Button variant="link" asChild>
                  <a href="#" onClick={(e) => { e.preventDefault(); handleForgotPassword(); }}>Forgot password?</a>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthGate;


