import { HelpTabPage } from '../HelpTabPage';

export function CreateAccountHelp({ title }) {
  return (
    <HelpTabPage title={title}>
      <h3 className="mt-4 mb-2 text-sm sm:text-base font-semibold text-gray-200">New user – Game account creation</h3>
      <ol className="list-decimal pl-5 m-0 space-y-2 text-sm text-gray-200">
        <li>Open the game or platform and go to the registration / sign-up section.</li>
        <li>Enter your details (phone / email) as required.</li>
        <li>Complete verification if prompted (OTP, email link, etc.).</li>
        <li>Set a secure password and confirm.</li>
        <li>After successful registration, log in and start playing.</li>
      </ol>

      <h3 className="mt-5 mb-2 text-sm sm:text-base font-semibold text-gray-200">Existing user – Login</h3>
      <ol className="list-decimal pl-5 m-0 space-y-2 text-sm text-gray-200">
        <li>Open the game or platform and go to the login section.</li>
        <li>Enter your registered phone number or email.</li>
        <li>Enter your password (or use OTP if enabled).</li>
        <li>Click Login to access your game account and wallet.</li>
      </ol>
    </HelpTabPage>
  );
}
