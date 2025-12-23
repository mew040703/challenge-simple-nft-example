"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";

export const SwitchTheme = ({ className }: { className?: string }) => {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const isDarkMode = resolvedTheme === "dark";

  const handleToggle = () => {
    if (isDarkMode) {
      setTheme("light");
      return;
    }
    setTheme("dark");
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <button 
        onClick={handleToggle}
        className="relative flex items-center justify-center h-10 w-20 rounded-full bg-base-200 shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg"
      >
        <div className={`absolute inset-0 flex items-center transition-all duration-500 ease-in-out ${isDarkMode ? 'justify-end' : 'justify-start'}`}>
          <div className="h-8 w-8 mx-1 rounded-full bg-gradient-to-br flex items-center justify-center shadow-md transition-all duration-300 ease-in-out"
               style={{
                 background: isDarkMode 
                   ? 'linear-gradient(135deg, #107575 0%, #026262 100%)' 
                   : 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)'
               }}
          >
            {isDarkMode ? (
              <MoonIcon className="h-5 w-5 text-base-100" />
            ) : (
              <SunIcon className="h-5 w-5 text-base-100" />
            )}
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-between px-2 opacity-50">
          <SunIcon className="h-4 w-4 text-yellow-500" />
          <MoonIcon className="h-4 w-4 text-primary" />
        </div>
      </button>
    </div>
  );
};
