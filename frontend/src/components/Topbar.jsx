import { motion } from "framer-motion";
import { Moon, Sun, Menu, X } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

export default function Topbar({ collapsed, onToggle, title }) {
  const { dark, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-background border-b border-border">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggle}
          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? <Menu size={20} /> : <X size={20} />}
        </button>
        <h1 className="font-serif text-2xl font-medium tracking-tight text-foreground">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <motion.button
          onClick={toggle}
          whileTap={{ scale: 0.9 }}
          whileHover={{ scale: 1.05 }}
          className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </motion.button>
      </div>
    </header>
  );
}
