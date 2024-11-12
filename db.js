import sqlite3 from 'sqlite3';
import CSV_HEADERS from './csv_headers.js';
import fs from 'fs';
import csvParser from 'csv-parser';

import { logger } from './logger.js'

const DATABASE_PATH = "./database.db"
const DATABASE_SCHEDULE_PATH = "./database_schedule.db"
const CSV_PATH = "./database.csv"

export const LIST_UPDATE_ATTRS = ['status', 'message', 'balance', 'dame_lv', 'cap_lv', 'recharge_lv', 'memefi_id', 'token']

const _delete_db_file = async () => {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(DATABASE_PATH)) {
            fs.unlinkSync(DATABASE_PATH, (err) => {
                if (err) reject(err)
                resolve()
            })
        }
        resolve()
    })
}

const _create_schema = async () => {
    const db = new sqlite3.Database(DATABASE_PATH, (err) => { if (err) { logger.error(err) } });
    return new Promise((resolve, reject) => {
        let db_column = []
        db_column.push("id INTEGER PRIMARY KEY")
        CSV_HEADERS.filter(header => { return header != "id" }).forEach((header) => {
            db_column.push(`${header} TEXT`)
        })
        db.run(`CREATE TABLE IF NOT EXISTS accounts (${db_column.join(',')})`,
            (err) => {
                if (err) {
                    reject(err);
                } else {
                    db.close((err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(1);
                        }
                    })
                }
            }
        )
    });
}

const _create_schema_schedule = async () => {
    const db = new sqlite3.Database(DATABASE_SCHEDULE_PATH, (err) => { if (err) { logger.error(err) } });
    return new Promise((resolve, reject) => {
        let db_column = []
        CSV_HEADERS.forEach((header) => {
            db_column.push(`${header} TEXT`)
        })
        db.run(`CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, next_time INTEGER)`,
            (err) => {
                if (err) {
                    reject(err);
                } else {
                    db.close((err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(1);
                        }
                    })
                }
            }
        )
    });
}

const _import_data = async () => {
    const db = new sqlite3.Database(DATABASE_PATH, (err) => { if (err) { logger.error(err) } });
    return new Promise((resolve, reject) => {
        fs.createReadStream(CSV_PATH)
            .pipe(csvParser())
            .on('data', (row) => {
                if (!row["id"]) { resolve() }
                const columns = Object.keys(row);
                const values = columns.map(col => row[col]);
                const placeholders = values.map(() => '?').join(',');
                const sql = `INSERT INTO accounts (${columns.join(',')}) VALUES (${placeholders})`;
                db.run(sql, values, (err) => {
                    if (err) reject(err)
                    db.close((err) => {
                        if (err) reject(err);
                        resolve();
                    })
                })
            })
    })
}

const _import_data_schedule = async () => {
    const db = new sqlite3.Database(DATABASE_SCHEDULE_PATH, (err) => { if (err) { logger.error(err) } });
    return new Promise((resolve, reject) => {
        fs.createReadStream(CSV_PATH)
            .pipe(csvParser())
            .on('data', (row) => {
                if (!row["id"]) { resolve() }
                const sql = `INSERT OR IGNORE INTO accounts (id, next_time) VALUES (?, ?)`;
                db.run(sql, [row["id"], (new Date()).getTime()], (err) => {
                    if (err) reject(err)
                    db.close((err) => {
                        if (err) reject(err);
                        resolve();
                    })
                })
            })
    })
}

export const initialize_database = async () => {
    logger.info("-".repeat(26))
    logger.info("Delete database...")
    await _delete_db_file()
    logger.info("Create schema...")
    await _create_schema()
    logger.info("Import database...")
    await _import_data()
    logger.info("-".repeat(26))
    return
}

export const initialize_database_schedule = async () => {
    logger.info("-".repeat(26))
    logger.info("Create schedule schema...")
    await _create_schema_schedule()
    logger.info("Import schedule database...")
    await _import_data_schedule()
    logger.info("-".repeat(26))
    return
}

export const update_account = async (wallet, attrs = LIST_UPDATE_ATTRS) => {
    const db = new sqlite3.Database(DATABASE_PATH, (err) => { if (err) { logger.error(err) } });
    let set_attrs = []
    let params = []
    attrs.forEach((attr) => {
        let data = wallet[attr]
        if (typeof data !== 'string') {
            data = JSON.stringify(data)
        }
        data = data.replaceAll('"', '').replaceAll(",", "")
        params.push(data)
        set_attrs.push(`${attr} = ?`)
    })
    const sql = `UPDATE accounts SET ${set_attrs.join(', ')} WHERE id = ${wallet['id']}`
    return await new Promise((resolve, reject) => {
        db.run(sql, params, (err, _) => {
            if (err) reject(err)
            db.close((err) => {
                if (err) reject(err);
                resolve();
            })
        })
    })
}

export const update_schedule_account = async (id, next_time) => {
    const db = new sqlite3.Database(DATABASE_SCHEDULE_PATH, (err) => { if (err) { logger.error(err) } });
    const sql = `UPDATE accounts SET next_time=${next_time} WHERE id = ${id}`
    return await new Promise((resolve, reject) => {
        db.run(sql, [], (err, _) => {
            if (err) reject(err)
            db.close((err) => {
                if (err) reject(err);
                resolve();
            })
        })
    })
}

export const get_account = async (id) => {
    const db = new sqlite3.Database(DATABASE_PATH, sqlite3.OPEN_READONLY, (err) => { if (err) { logger.error(err) } })
    const sql = `SELECT * FROM accounts WHERE id = ?`;
    return await new Promise((resolve, reject) => {
        db.get(sql, id, (err, rows) => {
            if (err) reject(err)
            db.close((err) => {
                if (err) reject(err);
                resolve(rows);
            })
        })
    })
}

export const get_accounts = async (ids = [], active = undefined) => {
    const db = new sqlite3.Database(DATABASE_PATH, sqlite3.OPEN_READONLY, (err) => { if (err) { logger.error(err) } })
    let sql = `SELECT * FROM accounts`
    let fillter = []
    if (ids.length > 0) {
        fillter.push(`id IN (${ids.join(',')})`)
    }
    if (active !== undefined) {
        fillter.push(`active = ${active}`)
    }
    if (fillter.length > 0) {
        sql += ` WHERE ${fillter.join(' AND ')}`
    }
    return await new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
            if (err) reject(err)
            db.close((err) => {
                if (err) reject(err);
                resolve(rows);
            })
        })
    })
}

export const get_schedule_accounts = async (ids = []) => {
    const db = new sqlite3.Database(DATABASE_SCHEDULE_PATH, sqlite3.OPEN_READONLY, (err) => { if (err) { logger.error(err) } })
    const next_time = (new Date()).getTime()
    let sql = `SELECT * FROM accounts`
    let fillter = []
    fillter.push(`next_time < ${next_time}`)
    if (ids.length > 0) {
        fillter.push(`id IN (${ids.join(',')})`)
    }
    if (fillter.length > 0) {
        sql += ` WHERE ${fillter.join(' AND ')}`
    }
    return await new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
            if (err) reject(err)
            db.close((err) => {
                if (err) reject(err);
                resolve(rows);
            })
        })
    })
}