import React, { useEffect } from 'react';
import ProfileScreen from './ProfileScreen.js';

// Web-only hotfix: business notifications already live in the canonical
// Deals hub. Do not duplicate them inside Profile, and do not render a
// second unread badge there. Native cleanup is handled separately; this
// wrapper keeps the production website aligned with the approved IA now.
export default function ProfileScreenWeb(props) {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const style = document.createElement('style');
    style.setAttribute('data-urtruck-profile-notifications-hotfix', '1');
    style.textContent = [
      '[data-testid="profile-notifications"]{display:none!important}',
      '[data-testid="profile-notifications-badge"]{display:none!important}',
    ].join('');
    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, []);

  return <ProfileScreen {...props} />;
}
