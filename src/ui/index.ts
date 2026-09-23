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
export { ChampDate } from "./champ-date";
export {
  ChampSelect,
  DeclencheurSelect,
  ListeChoix,
  ListeChoixMultiple,
  type OptionSelect,
  type DemandeChoix,
  type ApparenceSelect,
} from "./champ-select";
export { Card, CardHeader, Section } from "./card";
export { ListItem, type ListItemProps } from "./list-item";
export { Divider } from "./divider";
export { PinPad, PinDots } from "./pin-pad";
export { Badge, type BadgeTone } from "./badge";
export { Screen, type ScreenProps } from "./screen";
export { Spinner, type SpinnerProps } from "./spinner";
export { Logo } from "./logo";
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
export { StatValue, statValueSize, Mesure, mesureSize } from "./stat-value";
export { StatStrip, StatStripItem, type StatTone } from "./stat-strip";
export { ActionTile, type AccentTuile } from "./action-tile";
export { Chip, ChipRow, BoutonFiltres } from "./chip";
export { Pastille } from "./pastille";
export { ChampMontant, type DeviseChoisissable } from "./champ-montant";
export { Segmented, type OptionSegment } from "./segmented";
export { Switch } from "./switch";
export { Checkbox, CaseACocher } from "./checkbox";
export { BasculeTheme } from "./bascule-theme";
export {
  LIBELLE_THEME,
  ORDRE_THEME,
  themeSuivant,
  type ModeTheme,
} from "./theme-cycle";
export { SearchInput, BarreRecherche } from "./search-input";
export { Avatar, initiales } from "./avatar";
export { ProgressBar, BarreEmpilee } from "./progress";
export { Sheet } from "./sheet";
export { Dialog, AlertDialog } from "./dialog";
export { ToastProvider, useToast } from "./toast";
export { Fab, type ActionSecondaire } from "./fab";
export { Apparition } from "./apparition";
export { useMouvementReduit } from "./mouvement-reduit";
export { DataList, DataRow, DataSection } from "./data-list";
export { Tableau, Rang, type ColonneTableau } from "./tableau";
export { Stepper } from "./stepper";
export { TuileChoix } from "./tuile-choix";
export { HorsLigneBloquant } from "./hors-ligne";
export { MultiCurrencyTotal, CarteReleve } from "./multi-currency-total";
export { IconBrute } from "./icon";

// --- Lot 9 : le tableau de bord ---
export { BarChart, BarChartHorizontal, type PointGraphe } from "./bar-chart";
export { AreaChart, type PointAire } from "./area-chart";
export { DonutChart, couleurDeSerie, type TrancheDonut } from "./donut-chart";
export { VignetteArticle } from "./vignette-article";
