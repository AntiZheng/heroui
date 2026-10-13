import { create } from 'zustand'

type ThemeChoice = 'light' | 'dark' | 'system'

const media = window.matchMedia('(prefers-color-scheme: dark)')

function effective(choice: ThemeChoice): 'light' | 'dark' {
  return choice === 'system' ? (media.matches ? 'dark' : 'light') : choice
}

function initialChoice(): ThemeChoice {
  const saved = localStorage.getItem('theme')
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  return 'system'
}

function apply(choice: ThemeChoice) {
  document.documentElement.classList.toggle('dark', effective(choice) === 'dark')
}

export const useThemeStore = create<{ theme: ThemeChoice; setTheme: (t: ThemeChoice) => void }>(
  (set) => ({
    theme: initialChoice(),
    setTheme: (next) => {
      localStorage.setItem('theme', next)
      apply(next)
      set({ theme: next })
    },
  }),
)

apply(useThemeStore.getState().theme)

media.addEventListener('change', () => {
  if (useThemeStore.getState().theme === 'system') apply('system')
})
