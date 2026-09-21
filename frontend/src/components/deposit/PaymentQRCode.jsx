import { useMemo } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

/**
 * Renders a QR code from payment payload (address, BIP21 URI, or BOLT11).
 * Canvas (not SVG) so dashboard CSS cannot wipe the modules.
 */
export function PaymentQRCode({ payload, size = 200, theme = 'light' }) {
  const effectiveSize = Number.isFinite(size) && size > 0 ? Math.min(400, Math.max(128, size)) : 200;

  const { bgColor, fgColor } = useMemo(() => {
    if (theme === 'dark') {
      return { bgColor: '#1f2937', fgColor: '#f3f4f6' };
    }
    return { bgColor: '#ffffff', fgColor: '#000000' };
  }, [theme]);

  if (!payload || typeof payload !== 'string' || !payload.trim()) {
    return (
      <div className="inline-flex items-center justify-center rounded-lg bg-gray-800 p-6 text-gray-500 text-sm" style={{ width: effectiveSize + 24, height: effectiveSize + 24 }}>
        No payment data
      </div>
    );
  }

  return (
    <div
      className="spm-qr-code inline-block rounded-lg p-3"
      style={{
        backgroundColor: bgColor,
        width: effectiveSize + 24,
        height: effectiveSize + 24
      }}
      aria-label="Payment QR code"
    >
      <QRCodeCanvas
        value={payload.trim()}
        size={effectiveSize}
        level="M"
        bgColor={bgColor}
        fgColor={fgColor}
        includeMargin
      />
    </div>
  );
}
