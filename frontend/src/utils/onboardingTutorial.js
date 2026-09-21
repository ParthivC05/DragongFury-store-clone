function onboardingWelcomeSeenKey(userId) {
  return `onboarding_welcome_seen_${userId}`;
}

/** Restart the dashboard onboarding walkthrough from the tutorial opt-in step. */
export function startOnboardingTutorial({ navigate, userId } = {}) {
  try {
    localStorage.setItem('onboarding_pending', 'true');
    localStorage.setItem('onboarding_step', 'tutorial_prompt');
    localStorage.setItem('onboarding_user_type', 'new');
    if (userId) {
      localStorage.removeItem(onboardingWelcomeSeenKey(userId));
    }
  } catch (_) {
    /* ignore */
  }

  const onHome = typeof window !== 'undefined' && window.location.pathname === '/';
  if (!onHome) {
    if (navigate) {
      navigate('/');
    } else if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }

  try {
    window.dispatchEvent(new CustomEvent('onboarding:start', { detail: { restart: true } }));
  } catch (_) {
    /* ignore */
  }
}
