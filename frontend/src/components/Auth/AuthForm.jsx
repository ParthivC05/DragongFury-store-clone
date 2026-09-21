import { Link } from 'react-router-dom';
import { Field } from 'formik';
import { EyeIcon, EyeOffIcon } from '../../assets/icons';

const inputClass =
  'w-full py-2.5 px-3.5 text-sm text-gray-100 bg-input border border-gray-600 rounded-lg placeholder:text-muted focus:outline-none focus:border-primary';
const inputClassError = inputClass + ' border-red-500';
const groupClass = 'mb-4';
const labelClass = 'block mb-1 text-sm font-medium text-gray-400';

/**
 * Auth form driven by Formik. Used for both login and signup with field-level validation messages.
 */
export function AuthForm({ formik, fields, showPassword, togglePassword, submitLabel, footerLink, forgotPasswordLink, afterSubmit }) {
  const { values, errors, touched, handleChange, handleBlur, setFieldValue, handleSubmit, isSubmitting } = formik;

  const renderField = (field, className = groupClass) => {
    const value = values[field.name];
    const isPassword = field.type === 'password';
    const isCheckbox = field.type === 'checkbox';
    const id = `auth-${field.name}`;
    const hasError = touched[field.name] && errors[field.name];
    const inputCls = hasError ? inputClassError : inputClass;

    if (isCheckbox) {
      return (
        <div key={field.name} className="mt-4 mb-4">
          <div className="flex items-start gap-3">
            <Field
              id={id}
              name={field.name}
              type="checkbox"
              checked={!!values[field.name]}
              onChange={(e) => setFieldValue(field.name, e.target.checked)}
              onBlur={handleBlur}
              className="w-5 h-5 mt-0.5 accent-primary flex-shrink-0"
            />
            <label htmlFor={id} className="text-base text-gray-400">
              {field.label.includes('terms and conditions') ? (
                <>
                  I agree to the{' '}
                  <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-primary">
                    terms and conditions
                  </Link>{' '}
                  and{' '}
                  <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary">
                    privacy policy
                  </Link>
                  .
                </>
              ) : (
                field.label
              )}
            </label>
          </div>
          {touched[field.name] && errors[field.name] && (
            <p className="text-xs text-red-500 mt-1">{errors[field.name]}</p>
          )}
        </div>
      );
    }

    return (
      <div key={field.name} className={className}>
        <label htmlFor={id} className={labelClass}>
          {field.label}
        </label>
        {isPassword ? (
          <div className="relative">
            <Field
              id={id}
              name={field.name}
              type={showPassword ? 'text' : 'password'}
              value={value ?? ''}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder={field.placeholder}
              autoComplete={field.autoComplete}
              className={`${inputCls} pr-12`}
            />
            <button
              type="button"
              onClick={() => togglePassword()}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-gray-400 bg-transparent border-none cursor-pointer rounded"
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        ) : (
          <Field
            id={id}
            name={field.name}
            type={field.type}
            value={value ?? ''}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder={field.placeholder}
            autoComplete={field.autoComplete}
            className={inputCls}
          />
        )}
        {touched[field.name] && errors[field.name] && (
          <p className="mt-1 text-xs text-red-500">{errors[field.name]}</p>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      {fields.map((field, index) => {
        const nextField = fields[index + 1];
        const isFirstNameWithLastName = field.name === 'firstName' && nextField?.name === 'lastName';
        const isLastNameAfterFirstName = field.name === 'lastName' && index > 0 && fields[index - 1]?.name === 'firstName';

        if (isLastNameAfterFirstName) {
          return null;
        }
        if (isFirstNameWithLastName) {
          return (
            <div key="firstName-lastName-row" className={`${groupClass} flex gap-3 flex-wrap`}>
              {renderField(field, 'flex-1 min-w-0')}
              {renderField(nextField, 'flex-1 min-w-0')}
            </div>
          );
        }

        return renderField(field);
      })}
      {forgotPasswordLink && (
        <p className="mb-3 text-right text-xs text-gray-400">
          {forgotPasswordLink}
        </p>
      )}
      <button type="submit" className="btn-cta w-full py-2.5 text-sm font-medium disabled:opacity-50 rounded-lg" disabled={isSubmitting}>
        {isSubmitting ? 'Please wait…' : submitLabel}
      </button>
      {afterSubmit && <div className="mt-4">{afterSubmit}</div>}
      {footerLink && (
        <p className="mt-4 text-center text-sm text-gray-400">
          {footerLink}
        </p>
      )}
    </form>
  );
}
