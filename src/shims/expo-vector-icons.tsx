import React from 'react';
import * as LucideIcons from 'lucide-react';
import { StyleSheet, View } from './react-native';

const ICON_MAP: Record<string, string> = {
  home: 'Home',
  'home-outline': 'Home',
  search: 'Search',
  'search-outline': 'Search',
  menu: 'Menu',
  'menu-outline': 'Menu',
  'reorder-three': 'Menu',
  'reorder-three-outline': 'Menu',
  settings: 'Settings',
  'settings-outline': 'Settings',
  'more-vertical': 'MoreVertical',
  'more-horizontal': 'MoreHorizontal',
  'ellipsis-vertical': 'MoreVertical',
  'ellipsis-horizontal': 'MoreHorizontal',
  'ellipsis-horizontal-circle-outline': 'MoreHorizontal',
  'arrow-back': 'ArrowLeft',
  'arrow-forward': 'ArrowRight',
  'chevron-back': 'ChevronLeft',
  'chevron-forward': 'ChevronRight',
  'chevron-down': 'ChevronDown',
  'chevron-up': 'ChevronUp',
  close: 'X',
  'close-circle': 'XCircle',
  checkmark: 'Check',
  'checkmark-circle': 'CheckCircle2',
  'checkmark-done': 'CheckCheck',
  add: 'Plus',
  'add-circle': 'PlusCircle',
  'add-circle-outline': 'PlusCircle',
  'remove-circle-outline': 'MinusCircle',
  camera: 'Camera',
  'camera-outline': 'Camera',
  'camera-reverse': 'SwitchCamera',
  'camera-reverse-outline': 'SwitchCamera',
  flip: 'SwitchCamera',
  speedometer: 'Gauge',
  'speedometer-outline': 'Gauge',
  'color-filter': 'Palette',
  'color-filter-outline': 'Palette',
  'color-palette': 'Palette',
  wand: 'Wand2',
  'wand-outline': 'Wand2',
  magic: 'Wand2',
  enhance: 'Wand2',
  timer: 'Timer',
  'timer-outline': 'Timer',
  time: 'Clock',
  'time-outline': 'Clock',
  flash: 'Zap',
  'flash-off': 'ZapOff',
  sparkles: 'Sparkles',
  'sparkles-outline': 'Sparkles',
  images: 'Upload',
  'images-outline': 'Upload',
  albums: 'Layers',
  'albums-outline': 'Layers',
  'cloud-upload': 'Upload',
  'cloud-upload-outline': 'Upload',
  upload: 'Upload',
  play: 'Play',
  'play-circle': 'PlayCircle',
  'play-circle-outline': 'PlayCircle',
  pause: 'Pause',
  'musical-notes': 'Music',
  'musical-note': 'Music',
  videocam: 'Video',
  'videocam-outline': 'Video',
  'videocam-off': 'VideoOff',
  'volume-high': 'Volume2',
  'volume-medium': 'Volume2',
  'volume-mute': 'VolumeX',
  'volume-off': 'VolumeX',
  mic: 'Mic',
  'mic-off': 'MicOff',
  cut: 'Scissors',
  'cut-outline': 'Scissors',
  crop: 'Crop',
  download: 'Download',
  'download-outline': 'Download',
  'arrow-undo': 'Undo2',
  'arrow-redo': 'Redo2',
  options: 'SlidersHorizontal',
  'options-outline': 'SlidersHorizontal',
  sliders: 'SlidersHorizontal',
  text: 'Type',
  'text-outline': 'Type',
  heart: 'Heart',
  'heart-outline': 'Heart',
  chatbubble: 'MessageCircleMore',
  'chatbubble-outline': 'MessageCircleMore',
  'chatbubble-ellipses': 'MessageCircleMore',
  'chatbubble-ellipses-outline': 'MessageCircleMore',
  'share-social': 'Share2',
  'share-social-outline': 'Share2',
  bookmark: 'Bookmark',
  'bookmark-outline': 'Bookmark',
  person: 'User',
  'person-outline': 'User',
  people: 'Users',
  'people-outline': 'Users',
  'person-add': 'UserPlus',
  'person-add-outline': 'UserPlus',
  call: 'Phone',
  'call-outline': 'Phone',
  notifications: 'Bell',
  'notifications-outline': 'Bell',
  send: 'Send',
  'paper-plane': 'Send',
  'paper-plane-outline': 'Send',
  flag: 'Flag',
  'flag-outline': 'Flag',
  happy: 'Smile',
  'happy-outline': 'Smile',
  gift: 'Gift',
  'gift-outline': 'Gift',
  'trending-up': 'TrendingUp',
  'arrow-up-right': 'ArrowUpRight',
  megaphone: 'Megaphone',
  'megaphone-outline': 'Megaphone',
  cellular: 'Signal',
  wifi: 'Wifi',
  'wifi-outline': 'Wifi',
  'swap-vertical': 'ArrowUpDown',
  ban: 'Ban',
  'ban-outline': 'Ban',
  'alert-circle': 'AlertCircle',
  'alert-circle-outline': 'AlertCircle',
  'information-circle': 'Info',
  'information-circle-outline': 'Info',
  'help-circle': 'HelpCircle',
  'help-circle-outline': 'HelpCircle',
  'log-out': 'LogOut',
  'log-out-outline': 'LogOut',
  'lock-closed': 'Lock',
  'lock-closed-outline': 'Lock',
  'mail-outline': 'Mail',
  mail: 'Mail',
  star: 'Star',
  'star-outline': 'Star',
  'star-sharp': 'Star',
  ribbon: 'Award',
  'ribbon-outline': 'Award',
  medal: 'Medal',
  'medal-outline': 'Medal',
  award: 'Award',
  'award-outline': 'Award',
  badge: 'Award',
  crown: 'Crown',
  'crown-outline': 'Crown',
  repeat: 'Repeat',
  'repeat-outline': 'Repeat',
  eye: 'Eye',
  'eye-off': 'EyeOff',
  'eye-off-outline': 'EyeOff',
  'eye-outline': 'Eye',
  trash: 'Trash2',
  'trash-outline': 'Trash2',
  pin: 'Pin',
  'pin-outline': 'Pin',
  'pin-sharp': 'Pin',
  copy: 'Copy',
  link: 'Link',
  'link-outline': 'Link',
  globe: 'Globe',
  wallet: 'Wallet',
  'wallet-outline': 'Wallet',
  cash: 'CircleDollarSign',
  'cash-outline': 'CircleDollarSign',
  card: 'CreditCard',
  'card-outline': 'CreditCard',
  headset: 'Headphones',
  'headset-outline': 'Headphones',
  headphones: 'Headphones',
  'headphones-outline': 'Headphones',
  'help-buoy': 'LifeBuoy',
  'help-buoy-outline': 'LifeBuoy',
  lifebuoy: 'LifeBuoy',
  diamond: 'Gem',
  'diamond-outline': 'Gem',
  pencil: 'Pencil',
  'pencil-outline': 'Pencil',
  image: 'Image',
  'image-outline': 'Image',
  'cloud-offline-outline': 'CloudOff',
  sync: 'RotateCcw',
  refresh: 'RefreshCw',
  'logo-whatsapp': 'MessageCircle',
  'logo-instagram': 'Instagram',
  'logo-facebook': 'Facebook',
  'logo-youtube': 'Youtube',
  'logo-google': 'Chrome',
  'facebook-square': 'Facebook',
  'youtube-play': 'Youtube',
  instagram: 'Instagram',
};

const resolveLucideName = (name?: string): string => {
  if (!name) return 'Circle';
  if (ICON_MAP[name]) return ICON_MAP[name];
  const clean = name.replace(/-outline$/, '').replace(/-sharp$/, '').toLowerCase();
  if (ICON_MAP[clean]) return ICON_MAP[clean];
  if (clean.includes('monetiz') || clean.includes('wallet') || clean.includes('cash') || clean.includes('coin') || clean.includes('dollar')) return 'CircleDollarSign';
  if (clean.includes('headset') || clean.includes('headphone') || clean.includes('support')) return 'Headphones';
  if (clean.includes('lifebuoy') || clean.includes('buoy')) return 'LifeBuoy';
  if (clean.includes('help')) return 'HelpCircle';
  if (clean.includes('ribbon') || clean.includes('badge') || clean.includes('medal') || clean.includes('award')) return 'Award';
  if (clean.includes('star')) return 'Star';
  if (clean.includes('crown')) return 'Crown';
  if (clean.includes('repeat')) return 'Repeat';
  if (clean.includes('subscri') || clean.includes('people') || clean.includes('users') || clean.includes('member')) return 'Users';
  if (clean.includes('flip') || clean.includes('reverse')) return 'SwitchCamera';
  if (clean.includes('speed') || clean.includes('gauge')) return 'Gauge';
  if (clean.includes('filter') || clean.includes('palette')) return 'Palette';
  if (clean.includes('wand') || clean.includes('magic') || clean.includes('enhance')) return 'Wand2';
  if (clean.includes('timer') || clean.includes('stopwatch')) return 'Timer';
  if (clean.includes('time') || clean.includes('clock')) return 'Clock';
  if (clean.includes('flash') || clean.includes('lightning') || clean.includes('zap')) return 'Zap';
  if (clean.includes('upload')) return 'Upload';
  if (clean.includes('download')) return 'Download';
  if (clean.includes('image') || clean.includes('photo') || clean.includes('album')) return 'Image';
  if (clean.includes('video') || clean.includes('cam')) return 'Video';
  if (clean.includes('cellular') || clean.includes('signal')) return 'Signal';
  if (clean.includes('wifi')) return 'Wifi';
  if (clean.includes('ban') || clean.includes('block')) return 'Ban';
  if (clean.includes('alert') || clean.includes('warn')) return 'AlertCircle';
  if (clean.includes('info')) return 'Info';
  if (clean.includes('logout') || clean.includes('exit')) return 'LogOut';
  if (clean.includes('cut') || clean.includes('scissors')) return 'Scissors';
  if (clean.includes('diamond') || clean.includes('gem')) return 'Gem';
  if (clean.includes('sound') || clean.includes('volume') || clean.includes('audio')) return 'Volume2';
  if (clean.includes('music') || clean.includes('song')) return 'Music';
  if (clean.includes('trash') || clean.includes('delete')) return 'Trash2';
  if (clean.includes('pin')) return 'Pin';
  if (clean.includes('pencil') || clean.includes('edit')) return 'Pencil';
  if (clean.includes('check')) return 'Check';
  if (clean.includes('close') || clean.includes('cancel')) return 'X';
  if (clean.includes('user') || clean.includes('person')) return 'User';
  if (clean.includes('heart') || clean.includes('like')) return 'Heart';
  if (clean.includes('chat') || clean.includes('msg')) return 'MessageCircle';
  if (clean.includes('lock')) return 'Lock';
  if (clean.includes('menu')) return 'Menu';
  if (clean.includes('setting') || clean.includes('gear')) return 'Settings';
  return 'Circle';
};

const createIconComponent = (_family: string) => {
  const IconComponent: React.FC<{ name: string; size?: number; color?: string; style?: any }> & {
    font: Record<string, any>;
  } = ({ name, size = 24, color = '#fff', style }) => {
    const cleanName = String(name || '').trim().toLowerCase();
    if (cleanName === 'logo-whatsapp' || cleanName === 'whatsapp') {
      return (
        <View style={[styles.iconWrapper, style]}>
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fill={color}
              fillRule="evenodd"
              clipRule="evenodd"
              d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.98 3.8 13.46 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67ZM8.53 7.33C8.37 7.33 8.1 7.39 7.87 7.64C7.65 7.89 7 8.5 7 9.71C7 10.93 7.89 12.1 8 12.27C8.14 12.44 9.76 14.94 12.25 16.01C14.32 16.9 14.74 16.72 15.19 16.68C15.64 16.64 16.64 16.09 16.84 15.52C17.05 14.94 17.05 14.45 16.99 14.35C16.93 14.25 16.76 14.19 16.51 14.07C16.26 13.94 15.05 13.35 14.82 13.27C14.6 13.18 14.43 13.14 14.27 13.39C14.1 13.64 13.63 14.19 13.49 14.35C13.35 14.52 13.2 14.54 12.95 14.41C12.7 14.29 11.9 14.02 10.95 13.18C10.21 12.52 9.71 11.71 9.57 11.46C9.42 11.21 9.55 11.08 9.68 10.95C9.79 10.84 9.93 10.66 10.05 10.52C10.17 10.38 10.21 10.27 10.3 10.11C10.38 9.94 10.34 9.8 10.28 9.67C10.21 9.55 9.72 8.33 9.51 7.84C9.32 7.38 9.12 7.34 8.95 7.33C8.8 7.33 8.64 7.33 8.53 7.33Z"
            />
          </svg>
        </View>
      );
    }

    const lucideName = resolveLucideName(name);
    const LucideComp: any = (LucideIcons as any)[lucideName] || LucideIcons.Circle;
    const isHeartFilled = lucideName === 'Heart' && !String(name).includes('outline') && !String(name).includes('off');
    const isBookmarkFilled = lucideName === 'Bookmark' && !String(name).includes('outline');
    const isStarFilled = lucideName === 'Star' && !String(name).includes('outline');
    const shouldFill = isHeartFilled || isBookmarkFilled || isStarFilled;

    return (
      <View style={[styles.iconWrapper, style]}>
        <LucideComp
          size={size}
          color={color}
          strokeWidth={shouldFill ? 1 : 2}
          fill={shouldFill ? color : 'none'}
          style={shouldFill ? { fill: color } : { fill: 'none' }}
        />
      </View>
    );
  };
  IconComponent.font = {};
  return IconComponent;
};

export const Ionicons = createIconComponent('Ionicons');
export const Feather = createIconComponent('Feather');
export const FontAwesome = createIconComponent('FontAwesome');
export const MaterialIcons = createIconComponent('MaterialIcons');
export const AntDesign = createIconComponent('AntDesign');

const styles = StyleSheet.create({
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
