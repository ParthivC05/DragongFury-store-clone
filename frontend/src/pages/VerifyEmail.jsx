import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as authApi from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { usePageContentReady } from '../context/PageReadyContext';

const cardClass = 'max-w-lg mx-auto p-8 bg-card border border-gray-700 rounded-xl text-center';

export function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('emailToken') || searchParams.get('token');
  const { refreshUser, setUserAndToken } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState('loading');
  const settledRef = useRef(false);

  usePageContentReady(status !== 'loading');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      toast.error('Invalid verification link. Please request a new one from your profile.');
      return;
    }
    authApi.verifyEmail(token)
      .then((data) => {
        if (settledRef.current) return;
        settledRef.current = true;
        setStatus('success');
        toast.success(data.message || 'Your email has been verified.');
        if (data.token) authApi.setToken(data.token);
        if (data.user) setUserAndToken(data.user, data.token);
        else refreshUser();
      })
      .catch((err) => {
        if (settledRef.current) return;
        settledRef.current = true;
        setStatus('error');
        const msg = (err.body?.code === 'EMAIL_SERVICE_UNAVAILABLE' || err.status === 503)
          ? "We're facing some issue. Please try again later."
          : (err.message || 'Verification failed. Please request a new link from your profile.');
        toast.error(msg);
      });
  }, [token, refreshUser, setUserAndToken, toast]);

  if (status === 'loading') {
    return null;
  }

  if (status === 'success') {
    return (
      <div className={cardClass}>
        <h1 className="mb-2 text-xl font-bold text-green-500">Email verified</h1>
        <p className="text-gray-400 mb-6">You can now use your account.</p>
        <Link to="/settings" className="btn-cta w-auto px-6 py-2.5 no-underline inline-block">
          Go to profile &amp; settings
        </Link>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <h1 className="mb-2 text-xl font-bold text-red-500">Verification failed</h1>
      <p className="text-gray-400 mb-6">Please try again from profile settings.</p>
      <Link to="/settings" className="btn-cta w-auto px-6 py-2.5 no-underline inline-block">
        Profile &amp; settings
      </Link>
    </div>
  );
}
