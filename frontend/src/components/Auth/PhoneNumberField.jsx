import {
  composeE164,
  findPhoneCountry,
  parseE164
} from './phoneCountry';
import { UsaFlagIcon } from './UsaFlagIcon';
import './PhoneNumberField.css';

/**
 * Static USA (+1) country badge + national number input.
 * `value` / `onChange` use full E.164 (e.g. +14155552671).
 */
export function PhoneNumberField({
  id,
  value = '',
  onChange,
  disabled = false,
  readOnly = false,
  variant = 'dragonfury',
  className = '',
  inputClassName = '',
  name,
  onBlur,
  onFocus,
  'aria-label': ariaLabel = 'Phone number'
}) {
  const { national } = parseE164(value);
  const country = findPhoneCountry('US');
  const locked = Boolean(readOnly || disabled);

  const handleNationalChange = (e) => {
    if (locked) return;
    onChange?.(composeE164('US', e.target.value));
  };

  const rootClass =
    variant === 'gate'
      ? `phone-cc-field phone-cc-field--gate ${className}`.trim()
      : `phone-cc-field phone-cc-field--dragonfury ${className}`.trim();

  return (
    <div className={rootClass}>
      <div
        className="phone-cc-field__cc phone-cc-field__cc--static"
        id={id ? `${id}-cc` : undefined}
        aria-label="United States +1"
        title="United States (+1)"
      >
        <UsaFlagIcon className="phone-cc-field__cc-flag-svg" />
        <span className="phone-cc-field__cc-code">+{country.dialCode}</span>
      </div>
      <input
        id={id}
        name={name}
        className={`phone-cc-field__national ${inputClassName}`.trim()}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder={country.placeholder}
        value={national}
        onChange={handleNationalChange}
        onBlur={onBlur}
        onFocus={onFocus}
        readOnly={readOnly}
        disabled={disabled}
        aria-label={ariaLabel}
        maxLength={country.nationalLength + 4}
      />
    </div>
  );
}
