/**
 * Registre d'icones. FICHIER ENGENDRE - ne pas modifier a la main.
 *
 *   node scripts/generer-registre-icones.mjs
 *
 * Les noms sont ceux du CODE WEB (`frontend/components/layout/sidebar.tsx` et
 * les pages du back-office), pour que le miroir se relise a l'oeil. Le fichier
 * importe derriere peut porter un autre nom : lucide renomme d'une version
 * majeure a l'autre et le web n'est pas sur la meme que le mobile. La chaine
 * d'alias du paquet web donne le nom canonique, le generateur verifie ensuite
 * que le glyphe mobile a EXACTEMENT le meme trace.
 *
 * Pourquoi un registre et pas `import { X } from "lucide-react-native"` : le
 * barrel reexporte plus de 3 500 icones et Metro ne sait pas les elaguer de
 * facon fiable. Ici, ce qui n'est pas liste n'entre pas dans le paquet.
 *
 * 83 glyphes.
 *
 * Renommes entre les deux versions de lucide :
 *   BarChart3 (bar-chart-3) -> chart-column
 *   MoreVertical (more-vertical) -> ellipsis-vertical
 *   MoreHorizontal (more-horizontal) -> ellipsis
 *   Filter (filter) -> funnel
 *   CheckCircle2 (check-circle-2) -> circle-check
 *   AlertTriangle (alert-triangle) -> triangle-alert
 *   AlertCircle (alert-circle) -> circle-alert
 *   XCircle (x-circle) -> circle-x
 *   PauseCircle (pause-circle) -> circle-pause
 *
 * Redessines par lucide entre 0.563 (web) et 1.x (mobile), ecart assume :
 *   Coins : redessine et MIROITE : la grande piece passe de gauche a droite
 *   Gift : redessine
 *   PackageX : redessine
 *   Receipt : redessine
 *   Calendar : reproportionne : encoches 2v4 -> 2v3, filet a y=9 au lieu de 10
 */

import LayoutDashboard from "lucide-react-native/icons/layout-dashboard";
import ShoppingCart from "lucide-react-native/icons/shopping-cart";
import Package from "lucide-react-native/icons/package";
import Boxes from "lucide-react-native/icons/boxes";
import ClipboardList from "lucide-react-native/icons/clipboard-list";
import Wallet from "lucide-react-native/icons/wallet";
import BarChart3 from "lucide-react-native/icons/chart-column";
import Users from "lucide-react-native/icons/users";
import UserCog from "lucide-react-native/icons/user-cog";
import Crown from "lucide-react-native/icons/crown";
import Settings from "lucide-react-native/icons/settings";
import Store from "lucide-react-native/icons/store";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import ArrowRight from "lucide-react-native/icons/arrow-right";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import X from "lucide-react-native/icons/x";
import Plus from "lucide-react-native/icons/plus";
import Menu from "lucide-react-native/icons/menu";
import MoreVertical from "lucide-react-native/icons/ellipsis-vertical";
import MoreHorizontal from "lucide-react-native/icons/ellipsis";
import Check from "lucide-react-native/icons/check";
import Search from "lucide-react-native/icons/search";
import Filter from "lucide-react-native/icons/funnel";
import CheckCircle2 from "lucide-react-native/icons/circle-check";
import AlertTriangle from "lucide-react-native/icons/triangle-alert";
import AlertCircle from "lucide-react-native/icons/circle-alert";
import Info from "lucide-react-native/icons/info";
import Lock from "lucide-react-native/icons/lock";
import ShieldAlert from "lucide-react-native/icons/shield-alert";
import Ban from "lucide-react-native/icons/ban";
import XCircle from "lucide-react-native/icons/circle-x";
import Inbox from "lucide-react-native/icons/inbox";
import Trash2 from "lucide-react-native/icons/trash-2";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import LogOut from "lucide-react-native/icons/log-out";
import Save from "lucide-react-native/icons/save";
import Download from "lucide-react-native/icons/download";
import Upload from "lucide-react-native/icons/upload";
import Eye from "lucide-react-native/icons/eye";
import EyeOff from "lucide-react-native/icons/eye-off";
import Pencil from "lucide-react-native/icons/pencil";
import Phone from "lucide-react-native/icons/phone";
import Mail from "lucide-react-native/icons/mail";
import User from "lucide-react-native/icons/user";
import UserPlus from "lucide-react-native/icons/user-plus";
import Key from "lucide-react-native/icons/key";
import Cpu from "lucide-react-native/icons/cpu";
import Printer from "lucide-react-native/icons/printer";
import CloudDownload from "lucide-react-native/icons/cloud-download";
import PauseCircle from "lucide-react-native/icons/circle-pause";
import Warehouse from "lucide-react-native/icons/warehouse";
import Banknote from "lucide-react-native/icons/banknote";
import Coins from "lucide-react-native/icons/coins";
import Gift from "lucide-react-native/icons/gift";
import TrendingDown from "lucide-react-native/icons/trending-down";
import TrendingUp from "lucide-react-native/icons/trending-up";
import PackageX from "lucide-react-native/icons/package-x";
import Activity from "lucide-react-native/icons/activity";
import ArrowLeftRight from "lucide-react-native/icons/arrow-left-right";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import FolderTree from "lucide-react-native/icons/folder-tree";
import Tag from "lucide-react-native/icons/tag";
import Ruler from "lucide-react-native/icons/ruler";
import FileText from "lucide-react-native/icons/file-text";
import FileSpreadsheet from "lucide-react-native/icons/file-spreadsheet";
import Table from "lucide-react-native/icons/table";
import MapPin from "lucide-react-native/icons/map-pin";
import Truck from "lucide-react-native/icons/truck";
import Receipt from "lucide-react-native/icons/receipt";
import Calculator from "lucide-react-native/icons/calculator";
import Percent from "lucide-react-native/icons/percent";
import CreditCard from "lucide-react-native/icons/credit-card";
import Calendar from "lucide-react-native/icons/calendar";
import Clock from "lucide-react-native/icons/clock";
import ArrowUpRight from "lucide-react-native/icons/arrow-up-right";
import ArrowDownRight from "lucide-react-native/icons/arrow-down-right";
import Bell from "lucide-react-native/icons/bell";
import Sparkles from "lucide-react-native/icons/sparkles";
import Building2 from "lucide-react-native/icons/building-2";
import Pill from "lucide-react-native/icons/pill";
import UtensilsCrossed from "lucide-react-native/icons/utensils-crossed";

export const LUCIDE = {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  ClipboardList,
  Wallet,
  BarChart3,
  Users,
  UserCog,
  Crown,
  Settings,
  Store,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ArrowLeft,
  X,
  Plus,
  Menu,
  MoreVertical,
  MoreHorizontal,
  Check,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Lock,
  ShieldAlert,
  Ban,
  XCircle,
  Inbox,
  Trash2,
  RefreshCw,
  LogOut,
  Save,
  Download,
  Upload,
  Eye,
  EyeOff,
  Pencil,
  Phone,
  Mail,
  User,
  UserPlus,
  Key,
  Cpu,
  Printer,
  CloudDownload,
  PauseCircle,
  Warehouse,
  Banknote,
  Coins,
  Gift,
  TrendingDown,
  TrendingUp,
  PackageX,
  Activity,
  ArrowLeftRight,
  SlidersHorizontal,
  FolderTree,
  Tag,
  Ruler,
  FileText,
  FileSpreadsheet,
  Table,
  MapPin,
  Truck,
  Receipt,
  Calculator,
  Percent,
  CreditCard,
  Calendar,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Bell,
  Sparkles,
  Building2,
  Pill,
  UtensilsCrossed,
} as const;

export type NomLucide = keyof typeof LUCIDE;
