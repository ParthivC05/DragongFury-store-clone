import { memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { NotifyLockIcon } from '../icons';

export const Link2PlayNotifyButton = memo(function Link2PlayNotifyButton({ gameName }) {
  const navigate = useNavigate();
  const { search } = useLocation();

  const handleClick = () => {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    if (gameName) params.set('notify', gameName);
    const qs = params.toString();
    navigate(`/register${qs ? `?${qs}` : ''}`);
  };

  return (
    <button type="button" className="l2p-notify-btn" onClick={handleClick}>
      <NotifyLockIcon width={16} height={16} />
      Tell me when it&apos;s ready
    </button>
  );
});
