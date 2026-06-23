import { View } from 'react-native';
import { Icon, useTheme } from 'react-native-paper';

// A row of 5 stars for a 0–5 value (rounded to the nearest half).
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const theme = useTheme();
  const rounded = Math.round(value * 2) / 2;
  return (
    <View style={{ flexDirection: 'row' }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const icon = rounded >= i ? 'star' : rounded >= i - 0.5 ? 'star-half-full' : 'star-outline';
        return <Icon key={i} source={icon} size={size} color={theme.colors.primary} />;
      })}
    </View>
  );
}
