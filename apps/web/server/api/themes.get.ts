import type { ThemesResponse } from '@bouvet-team-photobooth/contracts'
import { themes } from '../utils/themes'

export default defineEventHandler((): ThemesResponse => ({ themes }))
