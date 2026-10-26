import { useState } from 'react';
import DashboardView from './components/DashboardView';
import SettingsView from './components/SettingsView';
import './App.css';

type Tab = 'dashboard' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <div className="app">
      <header>
        <h1>Focus Pool</h1>
        <nav>
          <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
            Dashboard
          </button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
            Settings
          </button>
        </nav>
      </header>
      <main>{tab === 'dashboard' ? <DashboardView /> : <SettingsView />}</main>
    </div>
  );
}
