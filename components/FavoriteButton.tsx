import { IconButton } from 'react-native-paper';
import { FavoriteSeed, useIsFavorite, useToggleFavorite } from '@/lib/favorites';

// Heart toggle for saving a business. Reusable across the discovery cards, the
// business profile header, and the favorites list. Reads the shared favorites
// cache, so it reflects the saved state everywhere at once.
const HEART_COLOR = '#e0245e';

export function FavoriteButton({
  business,
  size = 24,
  color,
}: {
  business: FavoriteSeed;
  size?: number;
  color?: string;
}) {
  const isFav = useIsFavorite(business.id);
  const toggle = useToggleFavorite();
  return (
    <IconButton
      icon={isFav ? 'heart' : 'heart-outline'}
      iconColor={isFav ? HEART_COLOR : color}
      size={size}
      disabled={toggle.isPending}
      onPress={() => toggle.mutate({ business, on: !isFav })}
      accessibilityLabel={isFav ? 'Remove from favorites' : 'Save to favorites'}
    />
  );
}
