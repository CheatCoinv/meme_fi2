import createPrompt from 'prompt-sync';
const prompt = createPrompt({ sigint: true });

import { initialize_database } from "./db.js"
import { runAll, update_db_to_csv } from './parent.js'

const ACTIONS = {
    '1': {
        code: 'tap',
        name: 'Tap.'
    },
    '2': {
        code: 'update_info',
        name: 'Update info.'
    },
    '3': {
        code: 'upgrade',
        name: 'Upgrade.'
    },
    '4': {
        code: 'do_task',
        name: 'Do task.'
    },
    '5': {
        code: 'link_wallet',
        name: 'Link wallet.'
    },
    '6': {
        code: 'spin',
        name: 'Spin.'
    },
    '7': {
        code: 'checkAir',
        name: 'Check air.'
    },
    '8': {
        code: 'okxSuiWallet',
        name: 'Okx sui wallet.'
    },
    '9': {
        code: 'get_list_task_ytb',
        name: 'Do task YTB'
    },

    '99': {
        code: 'update_db',
        name: 'Update db to csv.'
    },
}

let ACTION, DEFAULT_ACTION = '8'
const index = async () => {
    Object.keys(ACTIONS).forEach((k) => {
        console.log(`${k}. ${ACTIONS[k]['name']}`)
    })
    let choose = prompt(`choose(default ${DEFAULT_ACTION}): `)
    console.log()
    if (choose == "") choose = DEFAULT_ACTION
    let act = ACTIONS[choose]
    if (!act) return
    ACTION = act['code']
    if (ACTION == ACTIONS['99']['code']) {
        update_db_to_csv()
    } else {
        await initialize_database()
        let args = {}
        return runAll({ action: ACTION, args: args })
    }
}
index()