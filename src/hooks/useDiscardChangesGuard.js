import { useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';

/**
 * Защищает заполненную форму от случайного закрытия. Никакого скрытого
 * сохранения здесь нет: пользователь явно остаётся или безвозвратно
 * отбрасывает введённые данные.
 */
export function useDiscardChangesGuard({ navigation, hasChanges, t }) {
  const safeToLeaveRef = useRef(false);

  const markSafeToLeave = useCallback(() => {
    safeToLeaveRef.current = true;
  }, []);

  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (!hasChanges || safeToLeaveRef.current) return;

    event.preventDefault();
    Alert.alert(
      t('discard_changes_title'),
      t('discard_changes_body'),
      [
        { text: t('continue_editing'), style: 'cancel' },
        {
          text: t('discard_changes_action'),
          style: 'destructive',
          onPress: () => {
            safeToLeaveRef.current = true;
            navigation.dispatch(event.data.action);
          },
        },
      ],
    );
  }), [hasChanges, navigation, t]);

  return markSafeToLeave;
}
