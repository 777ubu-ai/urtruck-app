import React, { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../utils/AuthContext';
import { storage } from '../../utils/storage';
import { sessionRole } from '../../utils/externalFreightSession';
import { EXTERNAL_FREIGHT_ENABLED } from '../../utils/externalFreightFeed';
import { openFirstExternalFeed } from '../../utils/externalFreightFirstVisit';

// Main остаётся под лентой в стеке. Только авторизованный Main получает wrapper.
export default function withExternalFeedFirstVisit(MainComponent) {
  return function ExternalFeedFirstVisitMain(props) {
    const { session, hasToken, verificationLevel } = useAuth();
    const userId = session?.user?.id;
    const role = sessionRole(session);
    const verified = !!hasToken && Number(verificationLevel) >= 1;
    const owner = `${userId || ''}:${role || ''}:${verified}`;
    const ownerRef = useRef(owner);
    ownerRef.current = owner;
    const navigation = props.navigation;
    useFocusEffect(useCallback(() => {
      let active = true;
      openFirstExternalFeed({
        storage, navigation, userId, role, verified, enabled: EXTERNAL_FREIGHT_ENABLED,
        isCurrent: () => active && ownerRef.current === owner && navigation.isFocused(),
      });
      return () => { active = false; };
    }, [navigation, userId, role, verified, owner]));
    return <MainComponent {...props} />;
  };
}
