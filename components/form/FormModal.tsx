// A form in a Paper Modal sheet that stays usable with the keyboard open.
//
//  - `header` is pinned ABOVE the scrolling body, so Cancel / Save never scroll
//    away when a field is brought into view.
//  - The sheet's height is capped in points (never a percentage: see
//    lib/sheet.ts) and is also capped to the space the keyboard leaves.
//  - iOS: Paper's Modal sits in a full-screen layer iOS does not resize, so the
//    sheet is lifted by the keyboard height (as OrientationDialog does).
//    Android: no lift, the window is expected to resize (adjustResize); the
//    height cap still applies. Not verified on a device.
//
// Copied, not packaged: keep identical in app/ and customer-app/.
import { ReactNode, RefObject } from 'react';
import { Platform, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Modal, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from './useKeyboardHeight';

const SHEET_MARGIN = 16;

export function FormModal({
  header,
  children,
  onDismiss,
  dismissable = true,
  maxHeightFraction = 0.88,
  scrollRef,
}: {
  /** Pinned above the scrolling body (Cancel / title / Save). */
  header: ReactNode;
  children: ReactNode;
  onDismiss?: () => void;
  dismissable?: boolean;
  maxHeightFraction?: number;
  scrollRef?: RefObject<ScrollView | null>;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboard = useKeyboardHeight();

  const lift = Platform.OS === 'ios' ? Math.max(0, keyboard - insets.bottom) : 0;
  const taken = Platform.OS === 'ios' ? lift : keyboard;
  const room = windowHeight - insets.top - insets.bottom - taken - SHEET_MARGIN * 2;
  const maxHeight = Math.max(240, Math.min(Math.round(windowHeight * maxHeightFraction), room));

  return (
    <Modal
      visible
      onDismiss={onDismiss}
      dismissable={dismissable}
      contentContainerStyle={[
        styles.sheet,
        { backgroundColor: theme.colors.surface, marginBottom: SHEET_MARGIN + lift, maxHeight },
      ]}
    >
      {header}
      <ScrollView
        ref={scrollRef}
        style={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        {children}
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { margin: SHEET_MARGIN, borderRadius: 20, padding: 16 },
  // flexShrink lets the body give up height to the pinned header's siblings.
  body: { flexShrink: 1 },
});
