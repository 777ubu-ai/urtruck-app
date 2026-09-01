import React from 'react';
import { KeyboardAvoidingView, StyleSheet } from 'react-native';

// Android-specific host for the accepted-deal workspace.
//
// Regression 01.09.2026 (Xiaomi physical device): the shared screen currently
// uses KeyboardAvoidingView with Android behavior undefined. Even with
// windowSoftInputMode=adjustResize, MIUI can leave the composer underneath the
// IME. Keep the shared screen untouched and let Metro select this .android.js
// entrypoint. The outer height-based KAV restores the proven 30.08 behavior:
// the whole workspace shrinks when the keyboard opens, so the message input
// remains directly above the keyboard.
//
// The explicit .js suffix is intentional: without it Metro would resolve this
// .android.js file again and recurse.
import DealWorkspaceScreenV2Base from './DealWorkspaceScreenV2.js';

export default function DealWorkspaceScreenV2Android(props) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior="height"
      keyboardVerticalOffset={0}
      testID="deal-workspace-android-keyboard-host"
    >
      <DealWorkspaceScreenV2Base {...props} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
