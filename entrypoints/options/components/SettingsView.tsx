import { blocklist, productivityList } from '@/lib/storage';
import SiteListEditor from './SiteListEditor';
import RatioPicker from './RatioPicker';
import SessionDurationSettings from './SessionDurationSettings';
import DailyTargetSetting from './DailyTargetSetting';

export default function SettingsView() {
  return (
    <>
      <section className="card">
        <h2>Blocklist</h2>
        <SiteListEditor
          title="Sites to restrict"
          description="Inaccessible during a hard block, or during a session once your pool runs out."
          item={blocklist}
        />
      </section>

      <section className="card">
        <h2>Productivity list</h2>
        <SiteListEditor
          title="Sites that earn pool time"
          description="Time spent here during a session (or during a hard block) banks pool minutes."
          item={productivityList}
        />
      </section>

      <section className="card">
        <h2>Earn ratio</h2>
        <RatioPicker />
      </section>

      <section className="card">
        <h2>Daily goal</h2>
        <DailyTargetSetting />
      </section>

      <section className="card">
        <h2>Session lengths</h2>
        <SessionDurationSettings />
      </section>
    </>
  );
}
