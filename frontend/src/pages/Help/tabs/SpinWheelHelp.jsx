import { HelpTabPage } from '../HelpTabPage';

export function SpinWheelHelp({ title }) {
  return (
    <HelpTabPage
      title={title}
      note="Spin eligibility, cooldown, and rewards depend on platform rules."
    >
      <p className="mt-2 text-sm text-gray-300 m-0">
        Spin Wheel lets you claim rewards during available spin windows.
      </p>
      <ol className="list-decimal pl-5 mt-3 m-0 space-y-2 text-sm text-gray-200">
        <li>Open Spin Wheel page and check if your spin is available.</li>
        <li>If available, tap Spin and wait for result confirmation.</li>
        <li>Reward is credited to your wallet/account based on wheel result.</li>
        <li>If you win a deposit coupon, copy the code and apply it once on Deposit.</li>
        <li>If unavailable, check cooldown timer for next spin time.</li>
      </ol>
    </HelpTabPage>
  );
}
