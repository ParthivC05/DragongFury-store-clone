import { HelpTabPage } from '../HelpTabPage';

export function RedeemHelp({ title }) {
  return (
    <HelpTabPage
      title={title}
      note="Redeem is subject to game and platform rules. Check your game balance before redeeming."
    >
      <p className="mt-2 text-sm text-gray-300 m-0">
        When you redeem, coins move from the game back into your wallet and show in transactions.
      </p>
      <ol className="list-decimal pl-5 mt-3 m-0 space-y-2 text-sm text-gray-200">
        <li>
          <span className="font-semibold">Coins are deducted</span> from your game app balance.
        </li>
        <li>
          The equivalent amount is <span className="font-semibold">credited to your wallet</span> (SC).
        </li>
        <li>
          Your <span className="font-semibold">wallet balance and transaction history update</span>.
        </li>
        <li>You can view the redeem transaction in your wallet transactions list.</li>
      </ol>
    </HelpTabPage>
  );
}
