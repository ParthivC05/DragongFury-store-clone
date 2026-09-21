import { HelpTabPage } from '../HelpTabPage';

export function VipHelp({ title }) {
  return (
    <HelpTabPage
      title={title}
      note="VIP level updates may take some time to reflect after eligible activity."
    >
      <p className="mt-2 text-sm text-gray-300 m-0">
        VIP level is based on your platform activity and gives extra benefits.
      </p>
      <ol className="list-decimal pl-5 mt-3 m-0 space-y-2 text-sm text-gray-200">
        <li>Open Account &gt; VIP to see your current level and progress.</li>
        <li>Increase eligible activity to unlock higher VIP levels.</li>
        <li>Higher levels can provide better rewards or exclusive benefits.</li>
        <li>All VIP calculations and rewards follow platform VIP policy.</li>
      </ol>
    </HelpTabPage>
  );
}
