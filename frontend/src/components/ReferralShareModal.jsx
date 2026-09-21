import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CopyIcon, ShareIcon } from '../assets/icons';
import { useToast } from '../context/ToastContext';
import { site } from '../config/site';
import {
  REFERRAL_SHARE_PLATFORMS,
  getReferralShareTarget,
  openShareUrl,
} from '../utils/socialShare';
import { lockBodyScroll } from '../utils/bodyScrollLock';
import './ReferralShareModal.css';

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="rsm-platform-svg">
      <path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="rsm-platform-svg">
      <path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="rsm-platform-svg">
      <path fill="currentColor" d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z" />
    </svg>
  );
}

function TwitterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="rsm-platform-svg">
      <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="rsm-platform-svg">
      <path fill="currentColor" d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function VkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="rsm-platform-svg">
      <path fill="currentColor" d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.391 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.862-.525-2.049-1.727-1.033-1-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.575c0 .424-.135.678-1.253.678-1.846 0-3.896-1.118-5.335-3.202C4.624 10.857 4.03 8.57 4.03 8.096c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.677.863 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.744c.373 0 .508.203.508.643v3.49c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.254-1.406 2.151-3.574 2.151-3.574.119-.254.322-.491.763-.491h1.744c.525 0 .644.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.779 1.203 1.253.745.847 1.32 1.558 1.473 2.049.17.49-.085.744-.576.744z" />
    </svg>
  );
}

function OkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="rsm-platform-svg">
      <path fill="currentColor" d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm.287 5.7a3.292 3.292 0 110 6.584 3.292 3.292 0 010-6.584zm5.596 9.675c-.373.373-.98.373-1.353 0l-1.512-1.512-1.512 1.512c-.373.373-.98.373-1.353 0s-.373-.98 0-1.353l1.512-1.512-1.512-1.512c-.373-.373-.373-.98 0-1.353s.98-.373 1.353 0l1.512 1.512 1.512-1.512c.373-.373.98-.373 1.353 0s.373.98 0 1.353l-1.512 1.512 1.512 1.512c.373.373.373.98 0 1.353z" />
    </svg>
  );
}

function RedditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="rsm-platform-svg">
      <path fill="currentColor" d="M12 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 01-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 01.042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 014.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 01.14-.197.35.35 0 01.238-.042l2.906.617a1.214 1.214 0 011.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 00-.231.094.33.33 0 000 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 000-.514.348.348 0 00-.463 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 00-.232-.095z" />
    </svg>
  );
}

function GmailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="rsm-platform-svg">
      <path fill="currentColor" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
    </svg>
  );
}

function PinterestIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="rsm-platform-svg">
      <path fill="currentColor" d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="rsm-platform-svg">
      <path fill="currentColor" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

const PLATFORM_ICONS = {
  whatsapp: WhatsAppIcon,
  facebook: FacebookIcon,
  tiktok: TikTokIcon,
  twitter: TwitterIcon,
  telegram: TelegramIcon,
  vkontakte: VkIcon,
  odnoklassniki: OkIcon,
  reddit: RedditIcon,
  gmail: GmailIcon,
  pinterest: PinterestIcon,
  linkedin: LinkedInIcon,
};

const COPY_THEN_OPEN = {
  tiktok: 'https://www.tiktok.com/',
  instagram: 'https://www.instagram.com/',
};

const spring = { type: 'spring', stiffness: 340, damping: 28 };

const backdropMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.3, ease: 'easeOut' },
};

const modalMotion = {
  initial: { opacity: 0, scale: 0.86, y: 32 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.92, y: 16 },
  transition: spring,
};

const bodyStagger = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const revealItem = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0, transition: spring },
};

const platformGridStagger = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.045, delayChildren: 0.06 },
  },
};

const platformItem = {
  initial: { opacity: 0, scale: 0.78, y: 14 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { ...spring, stiffness: 380 } },
};

const instant = { duration: 0 };
export function ReferralShareModal({ open, onClose, referralLink, shareOptions = null }) {
  const { toast } = useToast();
  const reduceMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const siteName = site?.platformName || 'Dragon Fury';
  useEffect(() => {
    if (!open) return undefined;
    const releaseScrollLock = lockBodyScroll();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      releaseScrollLock();
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const handleCopy = () => {
    if (!referralLink?.trim()) {
      toast.error('Referral link is not ready yet.');
      return;
    }
    navigator.clipboard.writeText(referralLink).then(
      () => {
        setCopied(true);
        toast.success('Referral link copied!');
        setTimeout(() => setCopied(false), 2000);
      },
      () => toast.error('Could not copy.')
    );
  };

  const handlePlatformShare = async (platformId) => {
    if (!referralLink?.trim()) {
      toast.error('Referral link is not ready yet.');
      return;
    }

    const target = getReferralShareTarget(platformId, referralLink, siteName, shareOptions || {});
    if (!target.ok) {
      toast.error('Could not share right now.');
      return;
    }

    const label = REFERRAL_SHARE_PLATFORMS.find((p) => p.id === platformId)?.label || 'app';

    if (target.action === 'copy' || target.action === 'copy_and_open') {
      const fallbackUrl = target.shareUrl || COPY_THEN_OPEN[platformId];
      if (fallbackUrl) {
        openShareUrl(fallbackUrl);
      }
      try {
        await navigator.clipboard.writeText(target.text);
        toast.success(
          platformId === 'facebook'
            ? 'Message + link copied! Paste it on your Facebook post.'
            : `Link copied! Paste in ${label}.`
        );
      } catch {
        toast.error('Could not copy link.');
      }
      return;
    }

    const opened = openShareUrl(target.shareUrl);
    if (!opened && target.mailtoUrl) {
      openShareUrl(target.mailtoUrl);
    }
    toast.success(`Opening ${label}…`);
  };

  return createPortal(
    <AnimatePresence mode="wait">
      {open && (
        <motion.div
          key="referral-share-modal"
          className="rsm-backdrop fdb-backdrop"
          role="presentation"
          onClick={onClose}
          initial={reduceMotion ? false : backdropMotion.initial}
          animate={reduceMotion ? { opacity: 1 } : backdropMotion.animate}
          exit={reduceMotion ? undefined : backdropMotion.exit}
          transition={reduceMotion ? instant : backdropMotion.transition}
        >
          <motion.div
            className="rsm-modal fdb-modal rsm-modal--animated"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rsm-title"
            onClick={(e) => e.stopPropagation()}
            initial={reduceMotion ? false : modalMotion.initial}
            animate={reduceMotion ? { opacity: 1, scale: 1, y: 0 } : modalMotion.animate}
            exit={reduceMotion ? undefined : modalMotion.exit}
            transition={reduceMotion ? instant : modalMotion.transition}
          >
            <button type="button" className="rsm-close fdb-close" onClick={onClose} aria-label="Close" />

            <div className="rsm-glow rsm-glow--pulse fdb-glow-ring" aria-hidden />

            <div className="rsm-sparkles fdb-sparkles" aria-hidden>
              <span className="rsm-spark fdb-spark rsm-spark-1 fdb-spark-1">✦</span>
              <span className="rsm-spark fdb-spark rsm-spark-2 fdb-spark-2">✦</span>
              <span className="rsm-spark fdb-spark rsm-spark-3 fdb-spark-3">★</span>
              <span className="rsm-spark fdb-spark rsm-spark-4 fdb-spark-4">✦</span>
            </div>

            <motion.div
              className="rsm-body"
              variants={reduceMotion ? undefined : bodyStagger}
              initial={reduceMotion ? false : 'initial'}
              animate="animate"
            >
              <motion.div className="rsm-badge rsm-badge--pulse" variants={reduceMotion ? undefined : revealItem}>
                <ShareIcon className="rsm-badge-icon rsm-badge-icon--pulse" />
                <span>Refer &amp; Earn</span>
              </motion.div>

              <motion.h2 id="rsm-title" className="rsm-title" variants={reduceMotion ? undefined : revealItem}>
                Share your link
              </motion.h2>
              <motion.p className="rsm-subtitle" variants={reduceMotion ? undefined : revealItem}>
                Copy the link or pick an app to share
              </motion.p>

              <motion.div className="rsm-link-section" variants={reduceMotion ? undefined : revealItem}>
                <label className="rsm-link-label" htmlFor="rsm-referral-link">
                  Your referral link
                </label>
                <div className="rsm-link-row">
                  <input
                    id="rsm-referral-link"
                    type="text"
                    readOnly
                    value={referralLink}
                    className="rsm-link-input"
                    aria-label="Your referral link"
                  />
                  <button
                    type="button"
                    className={`rsm-copy-btn${copied ? ' rsm-copy-btn--copied' : ''}`}
                    onClick={handleCopy}
                  >
                    <CopyIcon className="rsm-copy-icon" />
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </motion.div>

              <motion.div className="rsm-share-section" variants={reduceMotion ? undefined : revealItem}>
                <h3 className="rsm-share-heading">
                  <span className="rsm-share-accent rsm-share-accent--pulse" aria-hidden />
                  Share to
                </h3>
                <motion.div
                  className="rsm-platform-grid"
                  role="group"
                  aria-label="Share referral link on social media"
                  variants={reduceMotion ? undefined : platformGridStagger}
                  initial={reduceMotion ? false : 'initial'}
                  animate="animate"
                >
                  {REFERRAL_SHARE_PLATFORMS.map((platform) => {
                    const Icon = PLATFORM_ICONS[platform.id];
                    return (
                      <motion.button
                        key={platform.id}
                        type="button"
                        className={`rsm-platform-btn rsm-platform-btn--${platform.id}`}
                        variants={reduceMotion ? undefined : platformItem}
                        onClick={() => handlePlatformShare(platform.id)}
                        title={`Share on ${platform.label}`}
                        aria-label={`Share on ${platform.label}`}
                        whileHover={reduceMotion ? undefined : { y: -3, scale: 1.03 }}
                        whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                      >
                        <span className="rsm-platform-icon-wrap">
                          <Icon />
                        </span>
                        <span className="rsm-platform-name">{platform.label}</span>
                      </motion.button>
                    );
                  })}
                </motion.div>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}