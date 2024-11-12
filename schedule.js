import schedule from 'node-schedule'

import { logger } from './logger.js'
import { runAll } from "./parent.js"
import { initialize_database, initialize_database_schedule } from "./db.js"

const index = async () => {
    await initialize_database()
    await initialize_database_schedule()
    const schedule_rule = '*/5 * * * *'
    logger.info(`Schedule ${schedule_rule}`)
    schedule.scheduleJob(schedule_rule, () => {
        logger.info("Schedule started")
        runAll({ action: 'all_in_one' }, true)
    })
}
index()
