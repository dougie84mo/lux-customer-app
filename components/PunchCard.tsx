import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

// Visual loyalty punch-card: `filled` of `total` slots stamped toward the next
// reward (e.g. ● ● ● ○ ○ = "3 of 5"). Display only — redemption is payment-gated.
export function PunchCard({
  filled,
  total,
  label,
}: {
  filled: number;
  total: number;
  label?: string;
}) {
  const theme = useTheme();
  const slots = Math.max(Math.floor(total), 0);
  const done = Math.min(Math.max(Math.floor(filled), 0), slots);

  return (
    <View>
      <View style={styles.row}>
        {Array.from({ length: slots }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < done
                ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                : { borderColor: theme.colors.outline },
            ]}
          />
        ))}
      </View>
      {label ? (
        <Text variant="bodySmall" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5 },
  label: { marginTop: 6 },
});
