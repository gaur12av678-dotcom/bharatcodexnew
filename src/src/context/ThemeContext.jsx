import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  // localStorage me saved theme, nahi to default dark
  const [theme, setTheme] = useState(() => localStorage.getItem('bharatcodex-theme') || 'dark')

  useEffect(() => {
    // html pe .light class toggle karo — CSS variables isi se change hote hain
    document.documentElement.classList.toggle('light', theme === 'light')
    localStorage.setItem('bharatcodex-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// Kisi bhi component me: const { theme, toggleTheme } = useTheme()
export const useTheme = () => useContext(ThemeContext)
