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
export { Badge, type BadgeTone } from "./badge";
export { BarresSysteme } from "./barres-systeme";
export { Screen, type ScreenProps } from "./screen";
export {
  BORDS_PAR_DEFAUT,
  rembourrageZoneSure,
  useMargesSysteme,
  type MargesSysteme,
} from "./zone-sure";
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
export { StatStrip, StatStripItem, LARGEUR_MIN_RELEVE, type StatTone } from "./stat-strip";
export {
  ActionTile,
  LARGEUR_MIN_RACCOURCI,
  LARGEUR_MIN_TUILE,
  type AccentTuile,
} from "./action-tile";
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
export { useModaleOuverte, modaleOuverte } from "./modales-ouvertes";
export { Dialog, AlertDialog } from "./dialog";
export { ToastProvider, useToast } from "./toast";
export { Fab, type ActionSecondaire } from "./fab";
export { Apparition } from "./apparition";
export { useMouvementReduit } from "./mouvement-reduit";
export { DataList, DataRow, DataSection, RepereSelection } from "./data-list";
export { Tableau, Rang, type ColonneTableau } from "./tableau";
export { Stepper } from "./stepper";
export { TuileChoix } from "./tuile-choix";
export { HorsLigneBloquant } from "./hors-ligne";
export {
  MultiCurrencyTotal,
  CarteReleve,
  LARGEUR_MIN_CARTE_RELEVE,
} from "./multi-currency-total";
export { IconBrute } from "./icon";

// --- Lot 9 : le tableau de bord ---
export { BarChart, BarChartHorizontal, type PointGraphe } from "./bar-chart";
export { AreaChart, type PointAire } from "./area-chart";
export { DonutChart, couleurDeSerie, type TrancheDonut } from "./donut-chart";
export { VignetteArticle } from "./vignette-article";

// --- Disposition adaptative : téléphones, tablettes, portrait et paysage ---
export {
  DispositionProvider,
  Volet,
  useDisposition,
  useRepliNavigation,
  type Disposition,
} from "./disposition";
export { AligneSurLaPage, Grille, Colonnes, Flux, RangeeChamps } from "./grille";
export {
  useListeFiche,
  useIdDeFiche,
  useSortieDeFiche,
  type ListeFiche,
  type OptionsListeFiche,
  type SorteDeFiche,
} from "./liste-fiche";
export { useVoletDeFiche } from "./volet-fiche";
export {
  LARGEUR_LATERALE_MAX,
  LARGEUR_LATERALE_MIN,
  LARGEUR_RAIL,
  afficheLibelles,
  colonnesPour,
  largeurMaxDe,
  margePage,
  formeDeModale,
  type ClasseFenetre,
  type Gabarit,
  type Navigation,
} from "./disposition-regles";
