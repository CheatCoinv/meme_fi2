import 'dotenv/config';
import createPrompt from 'prompt-sync';
const prompt = createPrompt({ sigint: true });
import fs from 'fs';
import csvParser from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';
import { fork } from 'child_process';

import { logger } from './logger.js'
import { get_accounts, get_schedule_accounts, LIST_UPDATE_ATTRS } from "./db.js"

const DB_NAME = "database.csv"

const _update_db_to_csv = async () => {
    const rows = [];
    return new Promise((resolve, reject) => {
        try {
            fs.createReadStream(DB_NAME)
                .pipe(csvParser())
                .on('data', (row) => {
                    rows.push(row);
                })
                .on('end', async () => {
                    const db_datas = await get_accounts()

                    for (const db_wallet of db_datas) {
                        const csvEntryIndex = rows.findIndex(entry => entry.id == db_wallet.id);
                        if (csvEntryIndex !== -1) {
                            LIST_UPDATE_ATTRS.forEach(attr => {
                                rows[csvEntryIndex][attr] = db_wallet[attr]
                            })
                            if (rows[csvEntryIndex].active != "1") {
                                rows[csvEntryIndex].status = 0
                                rows[csvEntryIndex].message = "Done"
                            }
                        }
                    }

                    const csvWriter = createObjectCsvWriter({
                        path: DB_NAME,
                        header: Object.keys(rows[0]).map(key => ({ id: key, title: key })),
                    });
                    await csvWriter.writeRecords(rows);
                    resolve()
                });
        } catch (e) {
            logger.error(e.message)
            reject(e)
        }
    })
}

let done_queue = []
let exit_queue = []
let list_processes = []
export const runAll = async (data, is_schedule = false) => {
    let accounts = []
    if (is_schedule) {
        accounts = await get_schedule_accounts()
    } else {
        accounts = await get_accounts([], true)
    }

    let account_ids = accounts.map(account => { return account.id })
    logger.info("-".repeat(26))
    logger.info(`${account_ids.length} accounts`)
    logger.info("-".repeat(26))

    let max_processes = parseInt(process.env.MAX_PROCESSES || "5")
    if (max_processes > account_ids.length) {
        max_processes = account_ids.length
    }

    let ids_array = new Array(max_processes).fill().map(() => []);
    for (const id of account_ids) {
        let arrayIndex = (id - 1) % max_processes;
        ids_array[arrayIndex].push(id);
    }
    let timeout
    if (is_schedule && ids_array.length) {
        timeout = setTimeout(() => {
            logger.info("Kill child")
            list_processes.forEach(pro => {
                pro.kill()
            })
        }, 5 * 60000 - 5000)
    }

    ids_array.forEach((ids, index) => {
        setTimeout(() => {
            const idx = index + 1
            try {
                let childProcess = fork('./child.js', [
                    JSON.stringify(ids),
                    idx,
                    JSON.stringify(data),
                    is_schedule ? "schedule" : ""
                ])
                list_processes.push(childProcess)
                childProcess.on('message', async (_) => {
                    logger.info(`---Process ${idx} Done---`)
                    done_queue.push(idx)
                })
                childProcess.on('exit', async () => {
                    exit_queue.push(idx)
                    if (exit_queue.length == max_processes) {
                        logger.info("---Update db to csv---")
                        await _update_db_to_csv(data.action)
                        const exit_processes = exit_queue.filter((element) => !done_queue.includes(element));
                        if (exit_processes.length) {
                            logger.info(`Process ${exit_processes.join(", ")} error!!!`)
                        }
                        if (timeout) {
                            clearTimeout(timeout)
                        }
                    }
                })
            } catch (e) {
                logger.error(idx)
                logger.error(e.message)
            }
        }, 200 * index)
    })
}


export const update_db_to_csv = async () => {
    logger.info('Updated db to csv...')
    await _update_db_to_csv()
}