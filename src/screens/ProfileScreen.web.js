import React, { useEffect } from 'react';
import ProfileScreen from './ProfileScreen.js';

// Входящие уведомления доступны через существующий пункт профиля;
// отдельный badge на нём по-прежнему не показывается.
export default function ProfileScreenWeb(props) {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const style = document.createElement('style');
    style.setAttribute('data-urtruck-profile-notifications-hotfix', '1');
    style.textContent = [
      '[data-testid="profile-notifications-badge"]{display:none!important}',
    ].join('');
    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, []);

  return <ProfileScreen {...props} />;
}
