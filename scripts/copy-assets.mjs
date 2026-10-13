import { cpSync, mkdirSync } from 'node:fs'

mkdirSync('dist/dashboard', { recursive: true })
cpSync('src/dashboard/index.html', 'dist/dashboard/index.html')
