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
export { PinPad, PinDots } from "./pin-pad";
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

// --- Lot 5bis : la coquille et la parite de presentation ---
export { AppBar } from "./app-bar";
export { TopBar } from "./top-bar";
export { PageHeader, type PageHeaderProps } from "./page-header";
export { StatValue, statValueSize } from "./stat-value";
export { StatStrip, StatStripItem, type StatTone } from "./stat-strip";
export { ActionTile, type AccentTuile } from "./action-tile";
export { Chip, ChipRow, BoutonFiltres } from "./chip";
export { Segmented, type OptionSegment } from "./segmented";
export { Switch } from "./switch";
export { SearchInput, BarreRecherche } from "./search-input";
export { Avatar, initiales } from "./avatar";
export { ProgressBar } from "./progress";
export { Sheet } from "./sheet";
export { Dialog, AlertDialog } from "./dialog";
export { ToastProvider, useToast } from "./toast";
export { Fab } from "./fab";
export { DataList, DataRow } from "./data-list";
export { PasEncore } from "./pas-encore";
export { Stepper } from "./stepper";
export { TuileChoix } from "./tuile-choix";
export { HorsLigneBloquant } from "./hors-ligne";
export { MultiCurrencyTotal, CarteReleve } from "./multi-currency-total";
export { IconBrute } from "./icon";

// --- Lot 9 : le tableau de bord ---
export { BarChart, type PointGraphe } from "./bar-chart";
