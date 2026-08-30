import { useEffect, useState, type CSSProperties } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

// Upstream shadcn wires this to next-themes' useTheme(). This app already
// owns theme state itself (see ThemeToggle.tsx, which toggles a `dark`
// class on <html>) - reusing that single source of truth instead of adding
// a second theme provider that duplicates it.
function isDarkNow() {
  return document.documentElement.classList.contains("dark")
}

const Toaster = ({ ...props }: ToasterProps) => {
  const [dark, setDark] = useState(isDarkNow)

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setDark(isDarkNow()))
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  return (
    <Sonner
      theme={dark ? "dark" : "light"}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
