import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import DeviceBlockModal from './DeviceBlockModal';
import { isDeviceBlockQueryError } from '../../lib/auth/deviceSignupErrors';
import {
  consumePendingDeviceBlockModal,
  DEVICE_SIGNUP_BLOCKED_EVENT,
  showDeviceBlockModal
} from '../../lib/auth/showDeviceBlockModal';

function AuthRedirectQueryWatcher() {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const errorCode = params.get('error');
    if (!errorCode || !isDeviceBlockQueryError(errorCode)) return;
    showDeviceBlockModal({
      registeredEmail: params.get('registeredEmail') || ''
    });
  }, [location.pathname, location.search]);

  return null;
}

function DeviceBlockModalController() {
  const [open, setOpen] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const applyDetail = useCallback((detail) => {
    if (!detail) return;
    setRegisteredEmail(typeof detail.registeredEmail === 'string' ? detail.registeredEmail.trim() : '');
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setRegisteredEmail('');
  }, []);

  useEffect(() => {
    const onBlocked = (event) => applyDetail(event?.detail);
    window.addEventListener(DEVICE_SIGNUP_BLOCKED_EVENT, onBlocked);
    const pending = consumePendingDeviceBlockModal();
    if (pending) applyDetail(pending);
    return () => window.removeEventListener(DEVICE_SIGNUP_BLOCKED_EVENT, onBlocked);
  }, [applyDetail]);

  return (
    <DeviceBlockModal open={open} onClose={handleClose} registeredEmail={registeredEmail} />
  );
}

export function DeviceBlockModalHost() {
  return (
    <>
      <DeviceBlockModalController />
      <AuthRedirectQueryWatcher />
    </>
  );
}
