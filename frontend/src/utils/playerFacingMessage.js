const AMOUNT_UNAVAILABLE_MESSAGE = "This amount isn't available. Please choose a different amount.";
const GENERIC_PAYMENT_ERROR = 'Something went wrong. Please try again.';
const UNAVAILABLE_MESSAGE = 'This payment method is not available right now. Please try again.';

function providerNamePattern() {
  return /\b(?:xxpay|xpay|dollarpay|dpay|orionstarspay|orion\s*stars?\s*pay)\b/gi;
}

/**
 * Player-facing copy must not name a payment processor (XXPay, Dpay, DollarPay, Orionstars Pay).
 * Amount rejections become one short line instead of a provider name plus the full allow-list.
 */
export function sanitizePlayerFacingMessage(message, options = {}) {
  if (typeof message !== 'string') return message;
  const text = message.trim();
  if (!text) return message;

  if (/does not allow amount|not allowed amount|choose one of:/i.test(text)) {
    return AMOUNT_UNAVAILABLE_MESSAGE;
  }

  if (!providerNamePattern().test(text)) return message;

  if (/vite_|credentials|parameter error|api[_ ]?key|_base_url|mch[_ ]?no|sign error|dollarpaywallet/i.test(text)) {
    return UNAVAILABLE_MESSAGE;
  }

  let cleaned = text
    .replace(providerNamePattern(), '')
    .replace(/\bfor\s+(?=on\b)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,:;!?])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .trim()
    .replace(/^[\s,.:;\-–—]+/, '')
    .replace(/[\s,:;\-–—]+$/, '');

  if (!cleaned || /\b(to|until|via|with|from)\s*[.,]/i.test(cleaned) || /\buntil\s+confirms\b/i.test(cleaned)) {
    return options.type === 'success' ? 'Your request was submitted.' : GENERIC_PAYMENT_ERROR;
  }

  if (/^(is|does|did|was|were|has|have|request|returned|failed)\b/i.test(cleaned)) {
    cleaned = `Payment ${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}`;
  } else {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}
