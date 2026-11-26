// One icon library (Lucide, outline) with one size and stroke weight everywhere.
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Ban,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock,
  Command,
  Copy,
  CornerDownLeft,
  Disc3,
  ExternalLink,
  FolderOpen,
  GripVertical,
  Image as ImageIcon,
  Inbox,
  Keyboard,
  KeyRound,
  PackageOpen,
  RefreshCw,
  ShieldAlert,
  Layers,
  LayoutDashboard,
  ListMusic,
  LogOut,
  Menu,
  Mic2,
  MoreHorizontal,
  Music,
  PanelRight,
  Pause,
  Play,
  Plus,
  ScrollText,
  Search,
  Server,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  Upload,
  Users,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

const make = (Icon: LucideIcon) =>
  function Wrapped({ size = 16, strokeWidth = 1.75, ...rest }: LucideProps) {
    return <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" {...rest} />;
  };

export const IActivity = make(Activity);
export const IArrowDown = make(ArrowDown);
export const IArrowUp = make(ArrowUp);
export const IBan = make(Ban);
export const IBell = make(Bell);
export const ICheck = make(Check);
export const IChevronDown = make(ChevronDown);
export const IChevronRight = make(ChevronRight);
export const IAlert = make(CircleAlert);
export const IClock = make(Clock);
export const ICommand = make(Command);
export const ICopy = make(Copy);
export const IEnter = make(CornerDownLeft);
export const IDisc = make(Disc3);
export const IExternal = make(ExternalLink);
export const IFolder = make(FolderOpen);
export const IGrip = make(GripVertical);
export const IImage = make(ImageIcon);
export const IInbox = make(Inbox);
export const IKeyboard = make(Keyboard);
export const IKey = make(KeyRound);
export const IImport = make(PackageOpen);
export const IRefresh = make(RefreshCw);
export const IShieldAlert = make(ShieldAlert);
export const ILayers = make(Layers);
export const IDashboard = make(LayoutDashboard);
export const IPlaylist = make(ListMusic);
export const ILogOut = make(LogOut);
export const IMenu = make(Menu);
export const IMic = make(Mic2);
export const IMore = make(MoreHorizontal);
export const IMusic = make(Music);
export const IPanel = make(PanelRight);
export const IPause = make(Pause);
export const IPlay = make(Play);
export const IPlus = make(Plus);
export const IScroll = make(ScrollText);
export const ISearch = make(Search);
export const IServer = make(Server);
export const ISettings = make(Settings);
export const IShare = make(Share2);
export const IShield = make(ShieldCheck);
export const ISparkles = make(Sparkles);
export const IStar = make(Star);
export const ITrash = make(Trash2);
export const ITrend = make(TrendingUp);
export const IUpload = make(Upload);
export const IUsers = make(Users);
export const IVolume = make(Volume2);
export const IMute = make(VolumeX);
export const IClose = make(X);
