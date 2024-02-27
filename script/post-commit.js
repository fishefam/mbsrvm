import { unlinkSync } from 'fs'

import { TEMP_TSCONFIG_FILE } from './_constant.js'
import { resolvePaths } from './_util.js'

unlinkSync(resolvePaths(TEMP_TSCONFIG_FILE))
