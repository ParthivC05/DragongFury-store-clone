import { HelpTabPage } from '../HelpTabPage';

export function RechargeHelp({ title }) {
  return (
    <HelpTabPage
      title={title}
      note="Make sure your wallet has enough SC before recharging. The transaction will reflect in wallet history and in the game."
    >
      <p className="mt-2 text-sm text-gray-300 m-0">
        When you recharge for the game, SC coins move from your wallet into your game balance.
      </p>
      <ol className="list-decimal pl-5 mt-3 m-0 space-y-2 text-sm text-gray-200">
        <li>
          <span className="font-semibold">SC coins are deducted</span> from your wallet (platform balance).
        </li>
        <li>
          The same amount is <span className="font-semibold">added to your game app balance</span>.
        </li>
        <li>
          Your <span className="font-semibold">wallet and game balances update</span> and reflect after completion.
        </li>
        <li>You can use the coins in the game as per the game rules.</li>
      </ol>
    </HelpTabPage>
  );
}
