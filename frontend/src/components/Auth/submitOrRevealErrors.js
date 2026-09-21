/**
 * Submits a Formik form, or marks the invalid fields as touched so their error
 * messages render. Without the touch pass, a blocked submit shows nothing at
 * all because every field error is gated on `touched`.
 * Returns true when the submit was handed off to Formik.
 */
export async function submitOrRevealErrors(formik, onInvalid) {
  const validationErrors = await formik.validateForm();
  const invalidFields = Object.keys(validationErrors);

  if (invalidFields.length > 0) {
    formik.setTouched(
      invalidFields.reduce((acc, field) => ({ ...acc, [field]: true }), {}),
      false
    );
    onInvalid?.();
    return false;
  }

  // Mirrors Formik's own handleSubmit, which warns instead of leaving the
  // submitForm() rejection unhandled.
  await formik.submitForm().catch((reason) => {
    console.warn('Warning: An unhandled error was caught from submitForm()', reason);
  });
  return true;
}
