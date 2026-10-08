import React, {useSyncExternalStore} from "react";
import {Moon, Sun, Monitor} from "lucide-react";
import {Button} from "./components/ui/button";
import {getThemeSnapshot, subscribeTheme, setThemePreference} from "./systemTheme";

export default function ThemeToggle() {
  const [preference, effective] = useSyncExternalStore(subscribeTheme, getThemeSnapshot).split(":");
  const dark = effective === "dark";
  const label = dark ? "Switch to light theme" : "Switch to dark theme";
  return <div className="flex items-center shrink-0">
    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={label} title={label}
      onClick={() => setThemePreference(dark ? "light" : "dark")}>
      {dark ? <Sun className="h-4 w-4"/> : <Moon className="h-4 w-4"/>}
    </Button>
    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Use system theme" title={preference === "system" ? "Following system theme" : "Use system theme"}
      aria-pressed={preference === "system"} onClick={() => setThemePreference("system")}>
      <Monitor className="h-4 w-4"/>
    </Button>
  </div>;
}
