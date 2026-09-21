import {
  REFERRAL_SOCIAL_PLATFORMS,
  openReferralSocialShare,
  buildReferralSharePayload,
  openReferralShareThenCopy,
} from '../../utils/socialShare';
import { useToast } from '../../context/ToastContext';
import { site } from '../../config/site';

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="ife-social-svg">
      <path
        fill="currentColor"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
      />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="ife-social-svg">
      <path
        fill="currentColor"
        d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"
      />
    </svg>
  );
}

function SnapchatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="ife-social-svg">
      <path
        fill="currentColor"
        d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.053.509.136.327.186.473.506.473.844 0 .195-.039.398-.104.614-.104.343-.228.652-.344.952-.09.24-.165.45-.21.615-.09.3-.12.585-.09.855.045.375.24.705.555.93.75.525 1.444.99 1.444 2.55 0 1.275-.705 2.055-1.62 2.55-.66.39-1.485.705-2.385.96-.51.15-1.035.285-1.5.435-.75.24-1.11.855-1.365 1.545-.24.645-.465 1.38-.705 1.98-.24.57-.51.99-.855 1.245-.705.525-1.605.81-2.55.81-.96 0-1.875-.3-2.595-.81-.345-.255-.615-.675-.855-1.245-.24-.6-.465-1.335-.705-1.98-.255-.69-.615-1.305-1.365-1.545-.465-.15-.99-.285-1.5-.435-.9-.255-1.725-.57-2.385-.96-.915-.495-1.62-1.275-1.62-2.55 0-1.56.694-2.025 1.444-2.55.315-.225.51-.555.555-.93.03-.27 0-.555-.09-.855-.045-.165-.12-.375-.21-.615-.116-.3-.24-.609-.344-.952-.065-.216-.104-.419-.104-.614 0-.338.146-.658.473-.844.15-.083.327-.136.509-.136.12 0 .299.016.464.104.374.181.733.285 1.033.301.198 0 .326-.045.401-.09-.008-.165-.018-.33-.03-.51l-.003-.06c-.104-1.628-.23-3.654.299-4.847 1.583-3.545 4.94-3.821 5.93-3.821z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="ife-social-svg">
      <path
        fill="currentColor"
        d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
      />
    </svg>
  );
}

const PLATFORM_ICONS = {
  whatsapp: WhatsAppIcon,
  instagram: InstagramIcon,
  snapchat: SnapchatIcon,
  facebook: FacebookIcon,
};

export function ReferralSocialShareRow({ referralLink, className = '', shareOptions = null }) {
  const { toast } = useToast();
  const siteName = site?.platformName || 'Casino Slots';
  const opts = shareOptions || {};

  const handleShare = async (platformId) => {
    if (!referralLink?.trim()) {
      toast.error('Referral link is not ready yet.');
      return;
    }

    if (platformId === 'instagram') {
      const { text } = buildReferralSharePayload(referralLink, siteName, opts);
      navigator.clipboard.writeText(text).then(
        () => {
          window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
          toast.success('Link copied! Paste in Instagram DM or Story.');
        },
        () => toast.error('Could not copy link.')
      );
      return;
    }

    const result = openReferralSocialShare(platformId, referralLink, siteName, opts);
    if (!result.ok) {
      toast.error('Referral link is not ready yet.');
      return;
    }

    if (result.action === 'copy_and_open') {
      const copyResult = await openReferralShareThenCopy(result);
      if (!copyResult.ok) {
        toast.error('Could not copy link.');
        return;
      }
      toast.success('Message + link copied! Paste it on your Facebook post.');
      return;
    }

    toast.success(`Opening ${REFERRAL_SOCIAL_PLATFORMS.find((p) => p.id === platformId)?.label || 'app'}…`);
  };

  return (
    <div className={`ife-social-block ${className}`.trim()}>
      <p className="ife-social-label">Share on social media</p>
      <div className="ife-social-row" role="group" aria-label="Share referral link on social media">
        {REFERRAL_SOCIAL_PLATFORMS.map((platform) => {
          const Icon = PLATFORM_ICONS[platform.id];
          return (
            <button
              key={platform.id}
              type="button"
              className={`ife-social-btn ife-social-btn--${platform.id}`}
              onClick={() => handleShare(platform.id)}
              title={`Share on ${platform.label}`}
              aria-label={`Share on ${platform.label}`}
            >
              <Icon />
              <span className="ife-social-btn-name">{platform.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
