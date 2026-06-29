import { StyleProp, ViewStyle } from 'react-native';
import { Chip, useTheme } from 'react-native-paper';

// One consistent, *obvious* selectable chip for filters/toggles (barber filter,
// tip presets, booking status tabs, …). Selected = filled primary with
// contrasting text + a leading check; unselected = outlined. The strong
// fill-vs-outline contrast is deliberate — Paper's default `selected` tint is too
// subtle to read at a glance.
export function SelectableChip({
  selected,
  onPress,
  children,
  icon,
  disabled,
  compact = true,
  style,
}: {
  selected: boolean;
  onPress: () => void;
  children: string;
  icon?: string;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <Chip
      compact={compact}
      mode={selected ? 'flat' : 'outlined'}
      selected={selected}
      showSelectedCheck={false}
      // A check on selection is the most unambiguous "this is chosen" cue.
      icon={selected ? icon ?? 'check' : icon}
      disabled={disabled}
      onPress={onPress}
      // Tints the icon (and Paper's internal text) on the selected fill.
      selectedColor={selected ? theme.colors.onPrimary : undefined}
      style={[selected ? { backgroundColor: theme.colors.primary } : undefined, style]}
      textStyle={selected ? { color: theme.colors.onPrimary, fontWeight: '700' } : undefined}
    >
      {children}
    </Chip>
  );
}
