/**
 * Design system.
 *
 * Aucun écran n'importe `react-native` pour du texte, un bouton, une carte ou
 * une couleur : tout passe par ici. C'est ce qui tient les jetons, les cibles
 * tactiles et le thème à un seul endroit, et ce qui a manqué à l'ancienne
 * application, où des `#374151` étaient semés dans les écrans.
 */
export { Text, type TextVariant, type TextProps } from "./text";
export { Pressable, type PressableProps, type HapticKind } from "./pressable";
export { Icon, type IconName, type IconProps } from "./icon";
export { Button, IconButton, type ButtonVariant, type ButtonSize } from "./button";
export { Input, FormField, type InputProps } from "./input";
export { Card, CardHeader, Section } from "./card";
export { ListItem, type ListItemProps } from "./list-item";
export { Divider } from "./divider";
export { Badge, type BadgeTone } from "./badge";
export { Screen, type ScreenProps } from "./screen";
export { Spinner, type SpinnerProps } from "./spinner";
export {
  Banner,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonList,
  Stack,
  type BannerTone,
} from "./feedback";
export {
  ThemeProvider,
  useTheme,
  useColor,
  type ThemePreference,
} from "./theme";
export {
  PALETTES,
  themeVars,
  rgbChannels,
  cssVarName,
  RADIUS,
  HIT,
  type ColorScheme,
  type ColorToken,
  type Palette,
} from "./tokens";
