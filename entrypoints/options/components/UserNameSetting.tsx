import { userName } from '@/lib/storage';
import { useStorageItem } from '@/lib/useStorageItem';

export default function UserNameSetting() {
  const name = useStorageItem(userName);
  if (name === undefined) return null;

  return (
    <div className="field-row">
      <label htmlFor="user-name">Your name</label>
      <input
        id="user-name"
        type="text"
        placeholder="Used to greet you on the dashboard"
        value={name}
        onChange={(e) => userName.setValue(e.target.value)}
      />
    </div>
  );
}
