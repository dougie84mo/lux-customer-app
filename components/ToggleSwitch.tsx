// The LUX toggle (2026-11-05), used in place of Paper's Switch everywhere.
//
// Paper's Switch is the native one tinted with `primary`, and our dark
// `primary` is near-white ink: switched on, the track turned the same white
// as the thumb and "on" was hard to tell from "off" (Doug, 2026-11-05).
// This one does not depend on the system control:
//   on  — violet track (violet is the brand's active-state colour) with a
//         white thumb carrying a check mark, so the state reads without colour;
//   off — outlined track, small grey thumb on the left.
// Same file in both phone apps (business app + LUX Booking); keep them alike.

import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, useTheme } from 'react-native-paper';

const VIOLET = { light: '#7558fb', dark: '#9074ff' } as const;
const TRACK_W = 52;
const TRACK_H = 32;
const THUMB = 24;
const OFF_SCALE = 16 / THUMB;
const TRAVEL = TRACK_W - TRACK_H; // thumb centre moves from H/2 to W - H/2

export function ToggleSwitch({
  value,
  onValueChange,
  disabled,
  style,
  accessibilityLabel,
  testID,
}: {
  value: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const theme = useTheme();
  const on = !!value;
  const violet = theme.dark ? VIOLET.dark : VIOLET.light;
  const offInk = theme.colors.onSurfaceVariant;

  const anim = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: on ? 1 : 0, duration: 140, useNativeDriver: true }).start();
  }, [on, anim]);

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [OFF_SCALE, 1] });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onValueChange?.(!on)}
      style={[disabled && styles.disabled, style]}
    >
      <View
        style={[
          styles.track,
          on
            ? { backgroundColor: violet, borderColor: violet }
            : { backgroundColor: theme.colors.surfaceVariant, borderColor: offInk },
        ]}
      >
        <Animated.View
          style={[
            styles.thumb,
            { backgroundColor: on ? '#ffffff' : offInk, transform: [{ translateX }, { scale }] },
          ]}
        >
          {on ? <Icon source="check" size={16} color={violet} /> : null}
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    borderWidth: 2,
    justifyContent: 'center',
  },
  thumb: {
    position: 'absolute',
    left: (TRACK_H - 4 - THUMB) / 2, // inside the 2 px border
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.38 },
});
