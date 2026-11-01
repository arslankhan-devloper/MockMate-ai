import assert from 'node:assert/strict'
import test from 'node:test'
import {
  THEME_STORAGE_KEY,
  loadThemeMode,
  parseThemeMode,
  resolveThemeDark,
} from '../src/lib/theme.ts'

function memoryStorage(value: string | null) {
  return {
    getItem: (key: string) => key === THEME_STORAGE_KEY ? value : null,
  }
}

test('theme mode restores a valid saved choice and defaults invalid values to light', () => {
  assert.equal(loadThemeMode(memoryStorage('dark')), 'dark')
  assert.equal(loadThemeMode(memoryStorage('system')), 'system')
  assert.equal(loadThemeMode(memoryStorage('light')), 'light')
  assert.equal(loadThemeMode(memoryStorage('sepia')), 'light')
  assert.equal(loadThemeMode(null), 'light')
  assert.equal(parseThemeMode(null), 'light')
})

test('theme mode resolves system appearance without changing the stored choice', () => {
  assert.equal(resolveThemeDark('light', true), false)
  assert.equal(resolveThemeDark('dark', false), true)
  assert.equal(resolveThemeDark('system', true), true)
  assert.equal(resolveThemeDark('system', false), false)
})

test('unreadable theme storage falls back safely', () => {
  const failing = {
    getItem: () => { throw new Error('blocked') },
  }
  assert.equal(loadThemeMode(failing), 'light')
})
