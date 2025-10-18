import { ReactNode } from "react";
import {
  BarChart3,
  Users,
  Settings,
  LogOut,
  Home,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarItem {
  id: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
}

interface SidebarProps {
  items?: SidebarItem[];
  onItemClick?: (itemId: string) => void;
}

export function Sidebar({ items = defaultItems, onItemClick }: SidebarProps) {
  return (
    <aside className="fixed left-0 top-0 h-screen w-20 bg-sidebar-background border-r border-sidebar-border flex flex-col items-center py-8 gap-8">
      {/* Logo */}
      <div className="text-primary text-2xl font-bold flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
        +
      </div>

      {/* Navigation items */}
      <nav className="flex flex-col gap-6 flex-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onItemClick?.(item.id)}
            className={cn(
              "flex items-center justify-center w-12 h-12 rounded-lg transition-all duration-200",
              item.active
                ? "bg-primary text-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-primary",
            )}
            title={item.label}
          >
            {item.icon}
          </button>
        ))}
      </nav>

      {/* Logout button */}
      <button className="flex items-center justify-center w-12 h-12 rounded-lg text-sidebar-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200">
        <LogOut size={20} />
      </button>
    </aside>
  );
}

const defaultItems: SidebarItem[] = [
  {
    id: "home",
    icon: <Home size={20} />,
    label: "Главная",
    active: true,
  },
  {
    id: "search",
    icon: <Users size={20} />,
    label: "Поиск",
  },
  {
    id: "activity",
    icon: <Activity size={20} />,
    label: "Активность",
  },
  {
    id: "analytics",
    icon: <BarChart3 size={20} />,
    label: "Аналитика",
  },
  {
    id: "settings",
    icon: <Settings size={20} />,
    label: "Настройки",
  },
];
