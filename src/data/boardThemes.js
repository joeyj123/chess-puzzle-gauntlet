export const boardThemes = [
  { id: 'classic', name: 'Classic Green', light: '#f0d9b5', dark: '#4a7c59' },
  { id: 'ocean',   name: 'Ocean Blue',    light: '#dee7ec', dark: '#4a6fa5' },
  { id: 'walnut',  name: 'Walnut',        light: '#e8d0aa', dark: '#8b5a2b' },
  { id: 'coral',   name: 'Coral',         light: '#ffe8d6', dark: '#e07856' },
  { id: 'midnight',name: 'Midnight',      light: '#c6cdd6', dark: '#3a3f58' },
]

export function getBoardTheme(id) {
  return boardThemes.find(t => t.id === id) || boardThemes[0]
}
