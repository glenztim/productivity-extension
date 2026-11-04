import { tabLimits } from '@/lib/storage';
import { useStorageItem } from '@/lib/useStorageItem';
import './App.css';

/** Shown instead of closing the last tab of a window, so a tab limit can never close the window or the browser. */
export default function App() {
  const limits = useStorageItem(tabLimits);
  // Only the limit's id travels in the URL; the pattern (the user's own list entry) is looked up here.
  const id = new URLSearchParams(location.search).get('limit');
  const limit = limits?.find((l) => l.id === id);

  const closeThisTab = async () => {
    const tab = await browser.tabs.getCurrent();
    if (tab?.id !== undefined) await browser.tabs.remove(tab.id);
  };

  return (
    <div className="limit-reached">
      <div className="card">
        <h1>Tab limit reached{limit ? ` for ${limit.pattern}` : ''}</h1>
        <p className="muted">
          {limit
            ? `${limit.pattern} is limited to ${limit.maxTabs} ${limit.maxTabs === 1 ? 'tab' : 'tabs'}, and it is already open.`
            : 'This site is limited to the number of tabs you set.'}{' '}
          This was the last tab in its window, so it was kept open and emptied instead of closed.
        </p>
        <button onClick={closeThisTab}>Close this tab</button>
        <button className="link" onClick={() => browser.runtime.openOptionsPage()}>
          Open dashboard
        </button>
      </div>
    </div>
  );
}
