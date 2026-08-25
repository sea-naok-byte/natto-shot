import { Moon, Clock, Coffee, Beer, Heart, BookOpen, MoreHorizontal, Star } from "lucide-react";

export const TYPES = [
  { key: "合流", icon: Heart },
  { key: "当直", icon: Moon },
  { key: "半日", icon: Clock },
  { key: "休み", icon: Coffee },
  { key: "飲み会", icon: Beer },
  { key: "勉強会", icon: BookOpen },
  { key: "その他", icon: MoreHorizontal },
  { key: "特別", icon: Star },
];

export const TYPE_ICON = Object.fromEntries(TYPES.map((t) => [t.key, t.icon]));

export const STAMPS = ["👍", "❤️", "🎉", "😂", "😢", "🙏", "🥳", "😴", "🍀", "🔥", "✨", "💦"];

export const EMOJIS = [
  "😊", "😂", "🥰", "😢", "😮", "🙏", "👍", "👎", "🎉", "❤️", "🔥", "✨",
  "😴", "🍀", "☕", "🍜", "🚗", "✈️", "📅", "💪", "😅", "🤔", "👏", "🙌",
];
