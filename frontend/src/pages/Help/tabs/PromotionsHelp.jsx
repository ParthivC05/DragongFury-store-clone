import { HelpTabPage } from '../HelpTabPage';

export function PromotionsHelp({ title }) {
  return (
    <HelpTabPage
      title={title}
      note="Always verify campaign dates and terms before participating."
    >
      <p className="mt-2 text-sm text-gray-300 m-0">
        Promotions give users bonus opportunities based on current campaign rules.
      </p>
      <ol className="list-decimal pl-5 mt-3 m-0 space-y-2 text-sm text-gray-200">
        <li>Open the Promotions page to check active offers and eligibility.</li>
        <li>Read each offer terms (validity, required actions, and limits).</li>
        <li>Complete the required action (for example recharge/play conditions).</li>
        <li>After qualification, bonus or reward is credited as per campaign policy.</li>
      </ol>
    </HelpTabPage>
  );
}
