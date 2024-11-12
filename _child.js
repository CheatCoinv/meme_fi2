import 'dotenv/config';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import moment from 'moment/moment.js';
import { jwtDecode } from "jwt-decode";
import puppeteer, { Browser } from 'puppeteer';
import path from 'path';
import Web3 from 'web3';
import { SuiWallet } from "@okxweb3/coin-sui";

import { logger } from './logger.js'
import { update_account, update_schedule_account, get_accounts, get_schedule_accounts } from "./db.js"
import fs from 'fs';
import parseTasksFromFile from './memefiYtb.js'
import { fileURLToPath } from 'url';
import pLimit from 'p-limit'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.join(__dirname, 'taskytb.txt');
const MAX_TAB = process.env.MAX_TAB || 10
const limit = pLimit(1);

const PATH_TO_EXTENSION = path.join(process.cwd(), 'hatd_puppeteer_proxy');
const REFFER_URL = "https://tg-app.memefi.club"
const CHECK_IP_URL = "https://api.ipify.org"
const USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"

const web3 = new Web3(new Web3.providers.HttpProvider("https://polygon-rpc.com/"))

const sleep = (delay) => {
    return new Promise(resolve => setTimeout(resolve, delay));
}

const random = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const next_day = () => {
    let current_date = new Date()
    current_date.setDate(current_date.getUTCDate() + 1)
    current_date.setHours(7, 0, 0, 0)
    return current_date.getTime()
}

const next_hour = () => {
    let current_date = new Date()
    current_date.setHours(current_date.getHours() + 1, 0, 0, 0)
    return current_date.getTime()
}

const t = function (e) {
    let t = Object.fromEntries(new URLSearchParams(e));
    return Object.keys(t).filter(e => "hash" !== e).map(e => "".concat(e, "=").concat(t[e])).sort().join("\n")
}

const UPGRASE_MAX = {
    Damage: process.env.MAX_DAMAGE,
    EnergyCap: process.env.MAX_ENERGY_CAP,
    EnergyRechargeRate: 3,
}
const MAP_NAME = {
    Damage: "weaponLevel",
    EnergyCap: "energyLimitLevel",
    EnergyRechargeRate: "energyRechargeLevel",
}

class Account {
    constructor(account) {
        this.accountObject = account;
        this.boot_end = false
    }

    logger = {
        info: (mess) => {
            logger.log('info', mess, { process_id: IDX, account_id: this.accountObject.id })
        },
        error: (mess) => {
            logger.log('error', mess, { process_id: IDX, account_id: this.accountObject.id })
        },
    }

    async _switch_proxy(proxy_url) {
        try {
            await PAGE.goto("about:blank")
            await PAGE.evaluate((arg) => {
                chrome.runtime.sendMessage(
                    arg.extension_id,
                    {
                        proxy_url: arg.proxy_url
                    }
                )
            }, { extension_id: EXTENSION_ID, proxy_url: proxy_url })
            await sleep(500)
            await PAGE.goto(CHECK_IP_URL, { timeout: 20000 })
            const pre = await PAGE.$("pre")
            const ip = await PAGE.evaluate(element => element.textContent, pre);
            this.logger.info(ip)
            return true
        } catch (e) {
            this.logger.error(e.message)
            return false
        }
    }

    async initialize() {
        this.logger.info("")
        let switch_proxy
        if (this.accountObject['http_proxy_url'] == '') {
            await this._switch_proxy("")
            switch_proxy = true
        } else {
            // logger.error(this.accountObject['http_proxy_url'])
            switch_proxy = await this._switch_proxy(this.accountObject['http_proxy_url'])
            if (!switch_proxy && this.accountObject['sock_proxy_url'] != "") {
                // logger.error("sock")
                switch_proxy = await this._switch_proxy(this.accountObject['sock_proxy_url'])
            }
        }
        if (!switch_proxy) {
            this.logger.error("Change proxy failed")
            return false
        }
        try {
            await PAGE.goto(REFFER_URL)
            await PAGE.evaluate(() => {
                localStorage.clear()
                sessionStorage.clear()
            })
            return true
        } catch (e) {
            logger.error(e.message)
            this.logger.error(e.message)
            return false
        }
    }

    async _update_schedule() {
        const next_time = Math.min(this.next_spin_time, this.next_turbo_tap_time)
        await update_schedule_account(this.accountObject.id, next_time)
    }

    async _requestPuPostMemefi(url, body, auth = true) {
        await PAGE.goto(REFFER_URL)
        let headers = { "content-type": "application/json" }
        if (auth) {
            headers['Authorization'] = `Bearer  ${this.accountObject['token']}`
        }
        try {
            const response = await PAGE.evaluate(async (args) => {
                const response = await fetch(args["url"], {
                    "headers": args["headers"],
                    "method": "POST",
                    "body": args["body"] == undefined ? null : JSON.stringify(args["body"]),
                }).then(r => {
                    if (r.ok) {
                        return r.json()
                    } else {
                        return r.text()
                    }
                })
                return response
            }, ({ url: url, body: body, headers: headers }))

            return response
        } catch (e) {
            this.logger.error(e.message)
            return { status: 500 }
        }
    }

    _update_account_object(telegramGameGetConfig) {
        this.accountObject['coinsAmount'] = telegramGameGetConfig.coinsAmount
        this.accountObject['currentEnergy'] = telegramGameGetConfig.currentEnergy
        this.accountObject['weaponLevel'] = telegramGameGetConfig.weaponLevel
        this.accountObject['energyLimitLevel'] = telegramGameGetConfig.energyLimitLevel
        this.accountObject['energyRechargeLevel'] = telegramGameGetConfig.energyRechargeLevel
        this.accountObject['currentHealth'] = telegramGameGetConfig.currentBoss.currentHealth
        this.accountObject['boss_lv'] = telegramGameGetConfig.currentBoss.level
        this.accountObject['currentRefillEnergyAmount'] = telegramGameGetConfig.freeBoosts.currentRefillEnergyAmount
        this.accountObject['currentTurboAmount'] = telegramGameGetConfig.freeBoosts.currentTurboAmount
        this.accountObject['nonce'] = telegramGameGetConfig.nonce
        this.accountObject.spinEnergyTotal = telegramGameGetConfig.spinEnergyTotal

        this.accountObject["balance"] = this.accountObject["coinsAmount"]
        this.accountObject["dame_lv"] = this.accountObject["weaponLevel"]
        this.accountObject["cap_lv"] = this.accountObject["energyLimitLevel"]
        this.accountObject["recharge_lv"] = this.accountObject["energyRechargeLevel"]
    }

    async _get_game() {
        if (!await this._login()) return false

        let response = await this._requestPuPostMemefi(
            "https://api-gw-tg.memefi.club/graphql",
            [
                {
                    "operationName": "QUERY_GAME_CONFIG",
                    "variables": {},
                    "query": 'query QUERY_GAME_CONFIG {\n  telegramGameGetConfig {\n    ...FragmentBossFightConfig\n    __typename\n  }\n}\n\nfragment FragmentBossFightConfig on TelegramGameConfigOutput {\n  _id\n  coinsAmount\n  currentEnergy\n  maxEnergy\n  weaponLevel\n  zonesCount\n  tapsReward\n  energyLimitLevel\n  energyRechargeLevel\n  tapBotLevel\n  currentBoss {\n    _id\n    level\n    currentHealth\n    maxHealth\n    __typename\n  }\n  freeBoosts {\n    _id\n    currentTurboAmount\n    maxTurboAmount\n    turboLastActivatedAt\n    turboAmountLastRechargeDate\n    currentRefillEnergyAmount\n    maxRefillEnergyAmount\n    refillEnergyLastActivatedAt\n    refillEnergyAmountLastRechargeDate\n    __typename\n  }\n  bonusLeaderDamageEndAt\n  bonusLeaderDamageStartAt\n  bonusLeaderDamageMultiplier\n  nonce\n  spinEnergyNextRechargeAt\n  spinEnergyNonRefillable\n  spinEnergyRefillable\n  spinEnergyTotal\n  spinEnergyStaticLimit\n  __typename\n}'
                },
                {
                    "operationName": "QueryTelegramUserMe",
                    "variables": {},
                    "query": "query QueryTelegramUserMe {\n  telegramUserMe {\n    firstName\n    lastName\n    telegramId\n    username\n    referralCode\n    isDailyRewardClaimed\n    referral {\n      username\n      lastName\n      firstName\n      bossLevel\n      coinsAmount\n      __typename\n    }\n    isReferralInitialJoinBonusAvailable\n    league\n    leagueIsOverTop10k\n    leaguePosition\n    _id\n    opens {\n      isAvailable\n      openType\n      __typename\n    }\n    features\n    role\n    earlyAdopterBonusAmount\n    earlyAdopterBonusPercentage\n    isFreeDurovDonated\n    hasPremiumSubscription\n    binanceTask {\n      binanceId\n      status\n      completionRewardCoins\n      validationRewardCoins\n      __typename\n    }\n    okxTask {\n      completionRewardCoins\n      okxWallet\n      status\n      okxTonWallet\n      __typename\n    }\n    okxSuiTask {\n      completionRewardCoins\n      okxSuiWallet\n      status\n      __typename\n    }\n    okxKycTask {\n      completionRewardCoins\n      okxId\n      status\n      __typename\n    }\n    __typename\n  }\n}"
                }
            ]
        )
        if (!response || response.length != 2) {
            this.accountObject['message'] = "Get game failed"
            this.accountObject['status'] = 1
            this.logger.error(response)
            return false
        }
        this._update_account_object(response[0].data.telegramGameGetConfig)
        this.accountObject.memefi_id = response[1].data.telegramUserMe._id
        this.earlyAdopterBonusAmount = response[1].data.telegramUserMe.earlyAdopterBonusAmount
        this.earlyAdopterBonusPercentage = response[1].data.telegramUserMe.earlyAdopterBonusPercentage
        this.okxSuiTask = response[1].data.telegramUserMe.okxSuiTask
        return true
    }

    async _login() {
        let need_login = true
        if (this.accountObject['token']) {
            const account_data = jwtDecode(this.accountObject['token'])
            if ((new Date(parseInt(account_data.exp) * 1000)) > (new Date())) {
                need_login = false
            }
        }

        if (!need_login) return true

        this.logger.info("Need login")
        const web_app_data = Object.fromEntries(new URLSearchParams(this.accountObject['tele_data'].replace(/.*tgWebAppData/, 'tgWebAppData')))
        const tgWebAppData = Object.fromEntries(new URLSearchParams(web_app_data.tgWebAppData))
        const checkDataString = t(web_app_data.tgWebAppData)
        const n = JSON.parse(tgWebAppData.user || "")
        let body = {
            "operationName": "MutationTelegramUserLogin",
            "variables": {
                webAppData: {
                    auth_date: Number(tgWebAppData.auth_date),
                    hash: tgWebAppData.hash || "",
                    query_id: tgWebAppData.query_id || "",
                    checkDataString: checkDataString,
                    user: {
                        id: n.id,
                        allows_write_to_pm: n.allows_write_to_pm,
                        first_name: n.first_name,
                        last_name: n.last_name,
                        username: n.username || "",
                        language_code: n.language_code,
                        version: "7.2",
                        platform: "android"
                    }
                }
            },
            "query": "mutation MutationTelegramUserLogin($webAppData: TelegramWebAppDataInput!) {\n  telegramUserLogin(webAppData: $webAppData) {\n    access_token\n    __typename\n  }\n}"
        }

        const login_response = await this._requestPuPostMemefi(
            "https://api-gw-tg.memefi.club/graphql",
            body,
            false
        )
        if (!login_response.data) {
            this.accountObject['message'] = "Login failed"
            this.accountObject['status'] = 1
            this.logger.error(login_response)
            return false
        }
        // logger.error(login_response)
        this.accountObject['token'] = login_response.data.telegramUserLogin.access_token
        return true
    }

    async _get_next_boss() {
        const response = await this._requestPuPostMemefi(
            "https://api-gw-tg.memefi.club/graphql",
            {
                "operationName": "telegramGameSetNextBoss",
                "variables": {},
                "query": "mutation telegramGameSetNextBoss {\n  telegramGameSetNextBoss {\n    ...FragmentBossFightConfig\n    __typename\n  }\n}\n\nfragment FragmentBossFightConfig on TelegramGameConfigOutput {\n  _id\n  coinsAmount\n  currentEnergy\n  maxEnergy\n  weaponLevel\n  energyLimitLevel\n  energyRechargeLevel\n  tapBotLevel\n  currentBoss {\n    _id\n    level\n    currentHealth\n    maxHealth\n    __typename\n  }\n  freeBoosts {\n    _id\n    currentTurboAmount\n    maxTurboAmount\n    turboLastActivatedAt\n    turboAmountLastRechargeDate\n    currentRefillEnergyAmount\n    maxRefillEnergyAmount\n    refillEnergyLastActivatedAt\n    refillEnergyAmountLastRechargeDate\n    __typename\n  }\n  bonusLeaderDamageEndAt\n  bonusLeaderDamageStartAt\n  bonusLeaderDamageMultiplier\n  nonce\n  __typename\n}"
            }
        )
        if (!response.data) {
            this.accountObject['message'] = "Get next boss failed"
            this.accountObject['status'] = 1
            this.logger.error(response)
            return false
        }
        this.logger.info("Get next boss done")
        this._update_account_object(response.data.telegramGameSetNextBoss)
        return true
    }

    async _tap(taps_count, vector = undefined) {
        if (this.boot_end) return false
        if (this.accountObject.currentHealth == 0 && !(await this._get_next_boss())) return false

        let payload = {
            "nonce": this.accountObject['nonce'],
            "tapsCount": taps_count,
        }
        if (vector) {
            payload.vector = vector
        }
        const response = await this._requestPuPostMemefi(
            "https://api-gw-tg.memefi.club/graphql",
            {
                "operationName": "MutationGameProcessTapsBatch",
                "variables": {
                    "payload": payload
                },
                "query": 'mutation MutationGameProcessTapsBatch($payload: TelegramGameTapsBatchInput!) {\n  telegramGameProcessTapsBatch(payload: $payload) {\n    ...FragmentBossFightConfig\n    __typename\n  }\n}\n\nfragment FragmentBossFightConfig on TelegramGameConfigOutput {\n  _id\n  coinsAmount\n  currentEnergy\n  maxEnergy\n  weaponLevel\n  zonesCount\n  tapsReward\n  energyLimitLevel\n  energyRechargeLevel\n  tapBotLevel\n  currentBoss {\n    _id\n    level\n    currentHealth\n    maxHealth\n    __typename\n  }\n  freeBoosts {\n    _id\n    currentTurboAmount\n    maxTurboAmount\n    turboLastActivatedAt\n    turboAmountLastRechargeDate\n    currentRefillEnergyAmount\n    maxRefillEnergyAmount\n    refillEnergyLastActivatedAt\n    refillEnergyAmountLastRechargeDate\n    __typename\n  }\n  bonusLeaderDamageEndAt\n  bonusLeaderDamageStartAt\n  bonusLeaderDamageMultiplier\n  nonce\n  spinEnergyNextRechargeAt\n  spinEnergyNonRefillable\n  spinEnergyRefillable\n  spinEnergyTotal\n  spinEnergyStaticLimit\n  __typename\n}'
            }
        )
        if (!response.data) {
            this.logger.error(response)
            this.logger.error("Tap failed")
            return false
        }
        // console.log(response)
        this._update_account_object(response.data.telegramGameProcessTapsBatch)
        const lv = response.data.telegramGameProcessTapsBatch.currentBoss.level
        const currentHealth = response.data.telegramGameProcessTapsBatch.currentBoss.currentHealth
        // if (currentHealth === 28000000) {
        //     this.boot_end = true
        // }
        this.logger.info(`Level:${lv}(${currentHealth}) tap: ${taps_count}`)
        return true
    }

    async _taps(tap_data) {
        for await (const tap of tap_data) {
            if (!await this._tap(tap.taps_count)) break
            await sleep(500)
        }
    }

    _caculate_tap(fixed_tap_count = undefined) {
        let data = []
        let currentEnergy = this.accountObject['currentEnergy']
        let weaponLevel = this.accountObject['weaponLevel'] + 1
        let total_taps = parseInt(currentEnergy / weaponLevel)

        while (total_taps > 0) {
            let random_tap = Math.floor(Math.random() * (400 - 200 + 1)) + 200
            if (fixed_tap_count) {
                random_tap = fixed_tap_count
            }
            if ((fixed_tap_count === undefined || fixed_tap_count == 999) && random_tap > total_taps) {
                random_tap = total_taps
            }
            data.push({ taps_count: random_tap })
            total_taps -= random_tap
        }
        return data
    }

    async _recharge_tap() {
        const clear_energy_tap_data = this._caculate_tap(999)
        await this._taps(clear_energy_tap_data)

        const boot_response = await this._requestPuPostMemefi(
            "https://api-gw-tg.memefi.club/graphql",
            {
                "operationName": "telegramGameActivateBooster",
                "variables": {
                    "boosterType": "Recharge"
                },
                "query": "mutation telegramGameActivateBooster($boosterType: BoosterType!) {\n  telegramGameActivateBooster(boosterType: $boosterType) {\n    ...FragmentBossFightConfig\n    __typename\n  }\n}\n\nfragment FragmentBossFightConfig on TelegramGameConfigOutput {\n  _id\n  coinsAmount\n  currentEnergy\n  maxEnergy\n  weaponLevel\n  energyLimitLevel\n  energyRechargeLevel\n  tapBotLevel\n  currentBoss {\n    _id\n    level\n    currentHealth\n    maxHealth\n    __typename\n  }\n  freeBoosts {\n    _id\n    currentTurboAmount\n    maxTurboAmount\n    turboLastActivatedAt\n    turboAmountLastRechargeDate\n    currentRefillEnergyAmount\n    maxRefillEnergyAmount\n    refillEnergyLastActivatedAt\n    refillEnergyAmountLastRechargeDate\n    __typename\n  }\n  bonusLeaderDamageEndAt\n  bonusLeaderDamageStartAt\n  bonusLeaderDamageMultiplier\n  nonce\n  __typename\n}"
            }
        )
        if (boot_response.errors) {
            this.accountObject['message'] = "Get recharge error"
            this.accountObject['status'] = 1
            this.logger.error("Get recharge error")
            this.logger.error(boot_response.errors[0].message)
            return false
        }
        this.logger.info("Get recharge done")
        this._update_account_object(boot_response.data.telegramGameActivateBooster)
        const tap_data = this._caculate_tap()
        await this._taps(tap_data)
        if (this.accountObject["currentRefillEnergyAmount"]) {
            await sleep(5000)
            return this._recharge_tap()
        } else {
            this.logger.info("Recharge out")
            return true
        }
    }

    async _turbo_tap() {
        this.next_turbo_tap_time = next_hour()
        const boot_response = await this._requestPuPostMemefi(
            "https://api-gw-tg.memefi.club/graphql",
            {
                "operationName": "telegramGameActivateBooster",
                "variables": {
                    "boosterType": "Turbo"
                },
                "query": "mutation telegramGameActivateBooster($boosterType: BoosterType!) {\n  telegramGameActivateBooster(boosterType: $boosterType) {\n    ...FragmentBossFightConfig\n    __typename\n  }\n}\n\nfragment FragmentBossFightConfig on TelegramGameConfigOutput {\n  _id\n  coinsAmount\n  currentEnergy\n  maxEnergy\n  weaponLevel\n  energyLimitLevel\n  energyRechargeLevel\n  tapBotLevel\n  currentBoss {\n    _id\n    level\n    currentHealth\n    maxHealth\n    __typename\n  }\n  freeBoosts {\n    _id\n    currentTurboAmount\n    maxTurboAmount\n    turboLastActivatedAt\n    turboAmountLastRechargeDate\n    currentRefillEnergyAmount\n    maxRefillEnergyAmount\n    refillEnergyLastActivatedAt\n    refillEnergyAmountLastRechargeDate\n    __typename\n  }\n  bonusLeaderDamageEndAt\n  bonusLeaderDamageStartAt\n  bonusLeaderDamageMultiplier\n  nonce\n  __typename\n}"
            }
        )
        if (boot_response.errors) {
            this.logger.error(boot_response.errors[0].message)
            this.logger.error("Get turbo error")
            this.next_turbo_tap_time = next_day()
            return false
        }
        this.logger.info("Get turbo done")
        this.boot_end = false
        this._update_account_object(boot_response.data.telegramGameActivateBooster)
        const tap_count = parseInt(process.env.TAP_TURBO || 1000000)

        const tap_data = [
            { taps_count: random(tap_count - parseInt(tap_count * 0.5), tap_count) },
        ]
        await this._taps(tap_data)
        if (this.accountObject.currentTurboAmount) {
            await sleep(15000)
            return this._turbo_tap()
        } else {
            this.logger.info("Turbo out")
            this.next_turbo_tap_time = next_day()
            return true
        }
    }

    async tap() {
        try {
            if (!(await this._get_game())) return

            this.accountObject['message'] = ""
            this.accountObject['status'] = 1
            if (this.accountObject["currentRefillEnergyAmount"]) {
                this.logger.info("Tap recharge")
                await this._recharge_tap()
            }
            if (this.accountObject["currentTurboAmount"]) {
                this.logger.info("Tap turbo")
                await this._turbo_tap()
            }
            const tap_data = this._caculate_tap()
            await this._taps(tap_data)
            this.accountObject.status = 0
            this.accountObject.message = "Tap done"
            return
        } catch (e) {
            this.logger.error("Catch tap")
            this.logger.error(e.message)
        } finally {
            await update_account(this.accountObject)
        }
    }

    async _upgrade(upgradeType) {
        const max = UPGRASE_MAX[upgradeType]
        const current_level = this.accountObject[MAP_NAME[upgradeType]]
        if (current_level >= max) {
            this.logger.info(`Upgrade ${upgradeType}: ${current_level} Max`)
            return true
        }
        const response = await this._requestPuPostMemefi(
            "https://api-gw-tg.memefi.club/graphql",
            {
                "operationName": "telegramGamePurchaseUpgrade",
                "variables": {
                    "upgradeType": upgradeType
                },
                "query": "mutation telegramGamePurchaseUpgrade($upgradeType: UpgradeType!) {\n  telegramGamePurchaseUpgrade(type: $upgradeType) {\n    ...FragmentBossFightConfig\n    __typename\n  }\n}\n\nfragment FragmentBossFightConfig on TelegramGameConfigOutput {\n  _id\n  coinsAmount\n  currentEnergy\n  maxEnergy\n  weaponLevel\n  energyLimitLevel\n  energyRechargeLevel\n  tapBotLevel\n  currentBoss {\n    _id\n    level\n    currentHealth\n    maxHealth\n    __typename\n  }\n  freeBoosts {\n    _id\n    currentTurboAmount\n    maxTurboAmount\n    turboLastActivatedAt\n    turboAmountLastRechargeDate\n    currentRefillEnergyAmount\n    maxRefillEnergyAmount\n    refillEnergyLastActivatedAt\n    refillEnergyAmountLastRechargeDate\n    __typename\n  }\n  bonusLeaderDamageEndAt\n  bonusLeaderDamageStartAt\n  bonusLeaderDamageMultiplier\n  nonce\n  __typename\n}"
            }
        )
        if (response.errors || !response.data) {
            this.accountObject['message'] = `Upgrade ${upgradeType}: error`
            this.accountObject['status'] = 1
            this.logger.error(response.errors[0].message)
            return false
        }
        this.logger.info(`Upgrade ${upgradeType}: ${this.accountObject[MAP_NAME[upgradeType]]} done`)
        this.accountObject['weaponLevel'] = response.data.telegramGamePurchaseUpgrade.weaponLevel
        this.accountObject['energyLimitLevel'] = response.data.telegramGamePurchaseUpgrade.energyLimitLevel
        this.accountObject['energyRechargeLevel'] = response.data.telegramGamePurchaseUpgrade.energyRechargeLevel
        return this._upgrade(upgradeType)
    }

    async upgrade() {
        try {
            if (!(await this._get_game())) return

            const EnergyRechargeRate = await this._upgrade("EnergyRechargeRate")
            const EnergyCap = await this._upgrade("EnergyCap")
            const Damage = await this._upgrade("Damage")
            if (!(EnergyRechargeRate && EnergyCap && Damage)) {
                this.accountObject.status = 1
                this.accountObject.message = "Upgrade failed"
            } else {
                this.accountObject.status = 0
                this.accountObject.message = "Upgrade done"
            }
        } catch (e) {
            this.logger.error("Catch upgrade")
            this.logger.error(e.message)
        } finally {
            await update_account(this.accountObject)
        }
    }

    async _do_task(campaign_id, task) {
        let return_value = false
        switch (task.status) {
            case "Completed":
                return_value = true
                break
            case "Pending":
                await sleep(500)
                const ver_response = await this._requestPuPostMemefi(
                    "https://api-gw-tg.memefi.club/graphql",
                    {
                        "operationName": "CampaignTaskToVerification",
                        "variables": {
                            "taskConfigId": task.id
                        },
                        "query": "fragment FragmentCampaignTask on CampaignTaskOutput {\n  id\n  name\n  description\n  status\n  type\n  position\n  buttonText\n  coinsRewardAmount\n  spinEnergyRewardAmount\n  link\n  userTaskId\n  isRequired\n  iconUrl\n  taskVerificationType\n  verificationAvailableAt\n  shouldUseVpn\n  isLinkInternal\n  quiz {\n    id\n    question\n    answers\n    __typename\n  }\n  __typename\n}\n\nmutation CampaignTaskToVerification($taskConfigId: String!) {\n  campaignTaskMoveToVerificationV2(taskConfigId: $taskConfigId) {\n    ...FragmentCampaignTask\n    __typename\n  }\n}"
                    }
                )
                if (ver_response.data) {
                    this.logger.info(`Campaign ${campaign_id}: Task ${task.id} verify done`)
                    return_value = false
                } else {
                    this.logger.error(`Campaign ${campaign_id}: Task ${task.id} verify error`)
                    this.logger.error(ver_response)
                    return_value = false
                }
                break
            case "Verification":
                const current_time = new Date()
                const ver_available_at = new Date(task.verificationAvailableAt)
                if (current_time < ver_available_at) {
                    this.logger.error(`Campaign ${campaign_id}: Task ${task.id} cooldown`)
                    return_value = false
                } else {
                    await sleep(500)
                    const complete_response = await this._requestPuPostMemefi(
                        "https://api-gw-tg.memefi.club/graphql",
                        {
                            "operationName": "CampaignTaskMarkAsCompleted",
                            "variables": {
                                "userTaskId": task.userTaskId
                            },
                            "query": "fragment FragmentCampaignTask on CampaignTaskOutput {\n  id\n  name\n  description\n  status\n  type\n  position\n  buttonText\n  coinsRewardAmount\n  spinEnergyRewardAmount\n  link\n  userTaskId\n  isRequired\n  iconUrl\n  taskVerificationType\n  verificationAvailableAt\n  shouldUseVpn\n  isLinkInternal\n  quiz {\n    id\n    question\n    answers\n    __typename\n  }\n  __typename\n}\n\nmutation CampaignTaskMarkAsCompleted($userTaskId: String!, $verificationCode: String, $quizAnswers: [CampaignTaskQuizQuestionInput!]) {\n  campaignTaskMarkAsCompleted(\n    userTaskId: $userTaskId\n    verificationCode: $verificationCode\n    quizAnswers: $quizAnswers\n  ) {\n    ...FragmentCampaignTask\n    __typename\n  }\n}"
                        }
                    )
                    if (complete_response.data) {
                        this.logger.info(`Campaign ${campaign_id}: Task ${task.id} claim done`)
                        return_value = true
                    } else {
                        this.logger.error(`Campaign ${campaign_id}: Task ${task.id} claim error`)
                        this.logger.error(complete_response.errors[0].message)
                        return_value = false
                    }
                }
                break
            default:
                this.logger.error(`Campaign ${campaign_id}: Task ${task.id} status ${task.status} not supported`)
                return_value = false
                break
        }
        return return_value
    }

    async _do_campaign_task(campaign) {
        if (
            this.ignore_campaign.includes(campaign.id) ||
            campaign.status == "Completed"
        ) return true

        const list_task_response = await this._requestPuPostMemefi(
            "https://api-gw-tg.memefi.club/graphql",
            {
                "operationName": "GetTasksList",
                "variables": {
                    "campaignId": campaign.id
                },
                "query": "fragment FragmentCampaignTask on CampaignTaskOutput {\n  id\n  name\n  description\n  status\n  type\n  position\n  buttonText\n  coinsRewardAmount\n  spinEnergyRewardAmount\n  link\n  userTaskId\n  isRequired\n  iconUrl\n  taskVerificationType\n  verificationAvailableAt\n  shouldUseVpn\n  isLinkInternal\n  quiz {\n    id\n    question\n    answers\n    __typename\n  }\n  __typename\n}\n\nquery GetTasksList($campaignId: String!) {\n  campaignTasks(campaignConfigId: $campaignId) {\n    ...FragmentCampaignTask\n    __typename\n  }\n}"
            }
        )
        if (!list_task_response.data) {
            this.logger.error(list_task_response)
            this.logger.error(`Campaign ${campaign.id}: get list task failed`)
            return false
        }
        let has_error = false
        for await (const task of list_task_response.data.campaignTasks) {
            if (!await this._do_task(campaign.id, task)) has_error = true
        }

        return !has_error
    }

    async do_task() {
        try {
            if (!(await this._get_game())) return
            this.ignore_campaign = process.env.IGNORE_CAMPAIGN.split(",")
            const list_campaign_response = await this._requestPuPostMemefi(
                "https://api-gw-tg.memefi.club/graphql",
                {
                    "operationName": "CampaignLists",
                    "variables": {},
                    "query": "fragment FragmentCampaign on CampaignOutput {\n  id\n  type\n  status\n  backgroundImageUrl\n  campaignUserParticipationId\n  completedTotalTasksAmount\n  description\n  endDate\n  iconUrl\n  isStarted\n  name\n  completionReward {\n    spinEnergyReward\n    coinsReward\n    claimedAt\n    id\n    __typename\n  }\n  totalRewardsPool\n  totalTasksAmount\n  collectedRewardsAmount\n  penaltyAmount\n  penaltySpinEnergyAmount\n  collectedSpinEnergyRewardsAmount\n  totalSpinEnergyRewardsPool\n  __typename\n}\n\nquery CampaignLists {\n  campaignLists {\n    special {\n      ...FragmentCampaign\n      __typename\n    }\n    normal {\n      ...FragmentCampaign\n      __typename\n    }\n    archivedCount\n    __typename\n  }\n}"
                }
            )
            if (!list_campaign_response.data) {
                this.accountObject.status = 1
                this.accountObject.message = "Get list campaign failed"
                this.logger.error(this.accountObject.message)
                this.logger.error(list_campaign_response)
                return
            }
            let has_error = false
            for await (const campaign of list_campaign_response.data.campaignLists.special) {
                if (!await this._do_campaign_task(campaign)) has_error = true
            }

            for await (const campaign of list_campaign_response.data.campaignLists.normal) {
                if (!await this._do_campaign_task(campaign)) has_error = true
            }
            if (has_error) {
                this.accountObject.status = 1
                this.accountObject.message = "Do task failed"
            } else {
                this.accountObject.status = 0
                this.accountObject.message = "Do task success"
            }
        } catch (e) {
            this.logger.error("Catch do_task")
            this.logger.error(e.message)
        } finally {
            await update_account(this.accountObject)
        }

    }

    async update_info() {
        if (!(await this._get_game())) {
            await update_account(this.accountObject)
            return
        }
        this.accountObject["balance"] = this.accountObject["coinsAmount"]
        this.accountObject["dame_lv"] = this.accountObject["weaponLevel"]
        this.accountObject["cap_lv"] = this.accountObject["energyLimitLevel"]
        this.accountObject["recharge_lv"] = this.accountObject["energyRechargeLevel"]

        this.accountObject['message'] = `Done`
        this.accountObject['status'] = 0
        this.logger.info("Done udpate info")
        await update_account(this.accountObject)
        return

    }

    async link_wallet() {
        if (!(await this._get_game())) {
            await update_account(this.accountObject)
            return
        }
        const current_wallet_response = await this._requestPuPostMemefi(
            "https://api-gw-tg.memefi.club/graphql",
            {
                "operationName": "TelegramMemefiWallet",
                "variables": {},
                "query": "query TelegramMemefiWallet {\n  telegramMemefiWallet {\n    walletAddress\n    dropMemefiAmountWei\n    signedTransaction {\n      contractAddress\n      functionName\n      contractType\n      deadline\n      nativeTokenValue\n      chainId\n      execTransactionValuesStringified\n      __typename\n    }\n    __typename\n  }\n}"
            }
        )
        if (current_wallet_response.errors) {
            this.accountObject['message'] = `Get current wallet error`
            this.accountObject['status'] = 1
            this.logger.error("Get current wallet error")
            this.logger.error(current_wallet_response)
            await update_account(this.accountObject)
            return
        }
        const current_wallet = current_wallet_response.data?.telegramMemefiWallet?.walletAddress
        const address = this.accountObject.address.toLowerCase()
        if (current_wallet) {
            if (current_wallet == address) {
                this.accountObject['message'] = `Already linked`
                this.accountObject['status'] = 0
                this.logger.info("Already linked")
                await update_account(this.accountObject)
                return
            } else {
                this.logger.error("Link different wallet")
            }
        }

        const message = `Memefi Telegram App: Linking wallet ${address}`
        const web3Account = web3.eth.accounts.privateKeyToAccount(this.accountObject.private_key)
        const signature = web3Account.sign(message, this.accountObject.private_key)
        const response = await this._requestPuPostMemefi(
            "https://api-gw-tg.memefi.club/graphql",
            [
                {
                    "operationName": "TelegramWalletLink",
                    "variables": {
                        "input": {
                            "signature": signature.signature,
                            "walletAddress": address
                        }
                    },
                    "query": "mutation TelegramWalletLink($input: TelegramMemefiWalletLinkInput!) {\n  telegramWalletLink(input: $input)\n}"
                }
            ]
        )
        if (response.errors) {
            this.accountObject['message'] = `Link wallet error`
            this.accountObject['status'] = 1
            this.logger.error("Link wallet error")
            this.logger.error(response)
        } else {
            this.accountObject['message'] = `Link wallet done`
            this.accountObject['status'] = 0
            this.logger.info("Link wallet done")
        }
        await update_account(this.accountObject)
        return
    }

    async _spin(reload_boss = true) {
        this.next_spin_time = next_hour()
        let spinsCount = 1
        if (this.accountObject.spinEnergyTotal > 1000) {
            spinsCount = 1000
        } else if (this.accountObject.spinEnergyTotal > 150) {
            spinsCount = 150
        } else if (this.accountObject.spinEnergyTotal > 50) {
            spinsCount = 50
        } else if (this.accountObject.spinEnergyTotal > 10) {
            spinsCount = 10
        } else if (this.accountObject.spinEnergyTotal > 5) {
            spinsCount = 5
        } else if (this.accountObject.spinEnergyTotal == 0) {
            this.logger.info("Spin out")
            this.next_spin_time = next_day()
            return true
        }
        const response = await this._requestPuPostMemefi(
            "https://api-gw-tg.memefi.club/graphql",
            {
                "operationName": "spinSlotMachine",
                "variables": {
                    "payload": {
                        "spinsCount": spinsCount
                    }
                },
                "query": "fragment FragmentBossFightConfig on TelegramGameConfigOutput {\n  _id\n  coinsAmount\n  currentEnergy\n  maxEnergy\n  weaponLevel\n  zonesCount\n  tapsReward\n  energyLimitLevel\n  energyRechargeLevel\n  tapBotLevel\n  currentBoss {\n    _id\n    level\n    currentHealth\n    maxHealth\n    __typename\n  }\n  freeBoosts {\n    _id\n    currentTurboAmount\n    maxTurboAmount\n    turboLastActivatedAt\n    turboAmountLastRechargeDate\n    currentRefillEnergyAmount\n    maxRefillEnergyAmount\n    refillEnergyLastActivatedAt\n    refillEnergyAmountLastRechargeDate\n    __typename\n  }\n  bonusLeaderDamageEndAt\n  bonusLeaderDamageStartAt\n  bonusLeaderDamageMultiplier\n  nonce\n  spinEnergyNextRechargeAt\n  spinEnergyNonRefillable\n  spinEnergyRefillable\n  spinEnergyTotal\n  spinEnergyStaticLimit\n  __typename\n}\n\nmutation spinSlotMachine($payload: SlotMachineSpinInput!) {\n  slotMachineSpinV2(payload: $payload) {\n    gameConfig {\n      ...FragmentBossFightConfig\n      __typename\n    }\n    spinResults {\n      id\n      combination\n      rewardAmount\n      rewardType\n      questItemsFromSpin\n      __typename\n    }\n    spinsProcessedCount\n    previousProgressBarConfig {\n      id\n      questItem\n      status\n      requiredQuestItems\n      collectedQuestItems\n      rewardType\n      rewardAmount\n      questEventEndsAt\n      questIndex\n      questLevel\n      __typename\n    }\n    nextProgressBarConfig {\n      id\n      questItem\n      status\n      requiredQuestItems\n      collectedQuestItems\n      rewardType\n      rewardAmount\n      questEventEndsAt\n      questIndex\n      questLevel\n      __typename\n    }\n    progressBarReward {\n      rewardType\n      rewardAmount\n      __typename\n    }\n    ethLotteryConfig {\n      requiredItems\n      collectedItems\n      isCompleted\n      ticketNumber\n      itemsFromSpin\n      maybePreviousCycleWinner {\n        id\n        name\n        bossLevel\n        ticketNumber\n        rewardEth {\n          currency\n          amount\n          __typename\n        }\n        rewardUsd {\n          currency\n          amount\n          __typename\n        }\n        isCurrentUser\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}"
            }
        )
        if (!response.data) {
            this.logger.error("Spin failed")
            this.logger.error(response)
            if (!reload_boss) {
                await sleep(5000)
                return this._spin(reload_boss)
            }
            return false
        }
        this._update_account_object(response.data.slotMachineSpinV2.gameConfig)
        this.logger.info(`Spin done. Remain ${this.accountObject.spinEnergyTotal} spin`)
        if (this.accountObject.currentHealth == 0 && reload_boss && !(await this._get_next_boss())) return false
        await sleep(1000)
        return this._spin(reload_boss)
    }

    async spin() {
        try {
            if (!(await this._get_game())) {
                await update_account(this.accountObject)
                return
            }
            if (await this._spin()) {
                this.accountObject.status = 0
                this.accountObject.message = "Spin done"
            } else {
                this.accountObject.status = 1
                this.accountObject.message = "Spin failed"
            }
            await update_account(this.accountObject)
            return
        } catch (e) {
            this.logger.error("Catch spin")
            this.logger.error(e.message)
            this.accountObject.status = 1
            this.accountObject.message = "Catch spin"
            await update_account(this.accountObject)
            return
        }
    }

    async spin_main_account() {
        try {
            if (!(await this._get_game())) return
            if (await this._spin(false)) {
                this.accountObject.status = 0
                this.accountObject.message = "Spin done"
            } else {
                this.accountObject.status = 1
                this.accountObject.message = "Spin failed"
            }
        } catch (e) {
            this.logger.error("Catch spin main account")
            this.logger.error(e.message)
        } finally {
            await update_account(this.accountObject)
        }
    }

    async all_in_one() {
        try {
            if (!(await this._get_game())) return
            const __spin = await this._spin()
            const __turbo_tap = await this._turbo_tap()
            if (__spin && __turbo_tap) {
                this.accountObject.status = 0
                this.accountObject.message = "All in one done"
            } else {
                this.accountObject.status = 1
                this.accountObject.message = "All in one failed"
            }
            await this._update_schedule()
        } catch (e) {
            this.logger.error("Catch all in one")
            this.logger.error(e.message)
        } finally {
            await update_account(this.accountObject)
        }
    }

    async checkAir() {
        try {
            if (!(await this._get_game())) return

            const response = await this._requestPuPostMemefi(
                "https://api-gw-tg.memefi.club/graphql",
                {
                    "operationName": "AirdropTodoTasks",
                    "variables": {},
                    "query": "query AirdropTodoTasks {\n  airdropTodoTasks {\n    campaigns {\n      currentAmount\n      done\n      requiredAmount\n      __typename\n    }\n    coins {\n      currentAmount\n      done\n      requiredAmount\n      __typename\n    }\n    ethLotteryTickets {\n      currentAmount\n      done\n      requiredAmount\n      __typename\n    }\n    premium {\n      done\n      __typename\n    }\n    starTransactions {\n      currentAmount\n      done\n      requiredAmount\n      __typename\n    }\n    tonTransactions {\n      currentAmount\n      done\n      requiredAmount\n      __typename\n    }\n    __typename\n  }\n}"
                }
            )
            if (!response.data) {
                this.accountObject.status = 1
                this.accountObject.message = "Check airdrop failed"
                this.logger.error("Check airdrop failed")
                this.logger.error(response)
                return
            }
            this.accountObject.status = 0
            const airdrop_task = response.data.airdropTodoTasks
            this.accountObject.message = `Coin: ${airdrop_task.coins.done} - Premium: ${airdrop_task.premium.done} - Ton tx: ${airdrop_task.tonTransactions.done} - Star tx: ${airdrop_task.starTransactions.done} - Eth lottery: ${airdrop_task.ethLotteryTickets.done} - Campaign: ${airdrop_task.campaigns.done}`
            this.logger.info(this.accountObject.message)
        } catch (e) {
            this.logger.error("Catch spin")
            this.logger.error(e.message)
            this.accountObject.status = 1
            this.accountObject.message = "Catch spin"
        } finally {
            await update_account(this.accountObject)
        }
    }
    //#region DoTask YTb
    async verifi_task(task) {
        const camp_MarkAsCompleted = await this._requestPuPostMemefi(
            "https://api-gw-tg.memefi.club/graphql",
            [
                {
                    "operationName": "CampaignTaskMarkAsCompleted",
                    "variables": {
                        "userTaskId": `${task.userTaskId}`,
                        "verificationCode": task.code
                    },
                    "query": "fragment FragmentCampaignTask on CampaignTaskOutput {\n  id\n  name\n  description\n  status\n  type\n  position\n  buttonText\n  coinsRewardAmount\n  spinEnergyRewardAmount\n  link\n  userTaskId\n  isRequired\n  iconUrl\n  taskVerificationType\n  verificationAvailableAt\n  shouldUseVpn\n  isLinkInternal\n  quiz {\n    id\n    question\n    answers\n    __typename\n  }\n  __typename\n}\n\nmutation CampaignTaskMarkAsCompleted($userTaskId: String!, $verificationCode: String, $quizAnswers: [CampaignTaskQuizQuestionInput!]) {\n  campaignTaskMarkAsCompleted(\n    userTaskId: $userTaskId\n    verificationCode: $verificationCode\n    quizAnswers: $quizAnswers\n  ) {\n    ...FragmentCampaignTask\n    __typename\n  }\n}"
                }
            ]
        )
        if (camp_MarkAsCompleted) {
            this.logger.info(`${camp_MarkAsCompleted[0].data?.campaignTaskMarkAsCompleted?.status}|${camp_MarkAsCompleted[0].data?.campaignTaskMarkAsCompleted?.id}|Nhận ${camp_MarkAsCompleted[0].data?.campaignTaskMarkAsCompleted?.coinsRewardAmount} Reward - ${camp_MarkAsCompleted[0].data?.campaignTaskMarkAsCompleted?.spinEnergyRewardAmount} Spin`)
        }
    }

    async do_task_ytb(task, code) {
        await this._requestPuPostMemefi(
            "https://api-gw-tg.memefi.club/graphql",
            [
                {
                    "operationName": "CampaignTaskToVerification",
                    "variables": {
                        "taskConfigId": `${task.id}`
                    },
                    "query": "fragment FragmentCampaignTask on CampaignTaskOutput {\n  id\n  name\n  description\n  status\n  type\n  position\n  buttonText\n  coinsRewardAmount\n  spinEnergyRewardAmount\n  link\n  userTaskId\n  isRequired\n  iconUrl\n  taskVerificationType\n  verificationAvailableAt\n  shouldUseVpn\n  isLinkInternal\n  quiz {\n    id\n    question\n    answers\n    __typename\n  }\n  __typename\n}\n\nmutation CampaignTaskToVerification($taskConfigId: String!) {\n  campaignTaskMoveToVerificationV2(taskConfigId: $taskConfigId) {\n    ...FragmentCampaignTask\n    __typename\n  }\n}"
                }
            ]
        );

        const camp_task_to_ver = await this._requestPuPostMemefi(
            "https://api-gw-tg.memefi.club/graphql",
            [
                {
                    "operationName": "GetTaskById",
                    "variables": {
                        "taskId": `${task.id}`
                    },
                    "query": "fragment FragmentCampaignTask on CampaignTaskOutput {\n  id\n  name\n  description\n  status\n  type\n  position\n  buttonText\n  coinsRewardAmount\n  spinEnergyRewardAmount\n  link\n  userTaskId\n  isRequired\n  iconUrl\n  taskVerificationType\n  verificationAvailableAt\n  shouldUseVpn\n  isLinkInternal\n  quiz {\n    id\n    question\n    answers\n    __typename\n  }\n  __typename\n}\n\nquery GetTaskById($taskId: String!) {\n  campaignTaskGetConfig(taskId: $taskId) {\n    ...FragmentCampaignTask\n    __typename\n  }\n}"
                }
            ]
        );
        this.logger.info(camp_task_to_ver[0].data?.campaignTaskGetConfig?.userTaskId)
        if (camp_task_to_ver) {
            return {
                task: task,
                userTaskId: camp_task_to_ver[0].data?.campaignTaskGetConfig?.userTaskId,
                date_AvailableAt: camp_task_to_ver[0].data?.campaignTaskGetConfig?.verificationAvailableAt,
                code: code
            };
        } else {
            return null;
        }


    }
    async get_list_task_ytb() {
        if (!(await this._login())) return;

        const list_campaign_ytb_response = await this._requestPuPostMemefi(
            "https://api-gw-tg.memefi.club/graphql",
            [
                {
                    "operationName": "CampaignListsSpecialGrouped",
                    "variables": {},
                    "query": "fragment FragmentCampaign on CampaignOutput {\n  id\n  type\n  status\n  backgroundImageUrl\n  campaignUserParticipationId\n  completedTotalTasksAmount\n  description\n  endDate\n  iconUrl\n  isStarted\n  name\n  completionReward {\n    spinEnergyReward\n    coinsReward\n    claimedAt\n    id\n    __typename\n  }\n  totalRewardsPool\n  totalTasksAmount\n  collectedRewardsAmount\n  penaltyAmount\n  penaltySpinEnergyAmount\n  collectedSpinEnergyRewardsAmount\n  totalSpinEnergyRewardsPool\n  __typename\n}\n\nfragment FragmentSpecialCampaign on SpecialCampaignOutput {\n  id\n  backgroundImageUrl\n  campaignUserParticipationId\n  collectedRewardsAmount\n  collectedSpinEnergyRewardsAmount\n  completedTotalTasksAmount\n  description\n  endDate\n  iconUrl\n  isHot\n  isStarted\n  name\n  penaltyAmount\n  penaltySpinEnergyAmount\n  status\n  totalRewardsPool\n  totalSpinEnergyRewardsPool\n  totalTasksAmount\n  type\n  completionReward {\n    claimedAt\n    coinsReward\n    id\n    spinEnergyReward\n    __typename\n  }\n  __typename\n}\n\nquery CampaignListsSpecialGrouped {\n  campaignListsSpecialGrouped {\n    special {\n      ...FragmentSpecialCampaign\n      __typename\n    }\n    normal {\n      ...FragmentCampaign\n      __typename\n    }\n    archivedCount\n    __typename\n  }\n}"
                },
                {
                    "operationName": "CampaignTasksSpecial",
                    "variables": {},
                    "query": "fragment FragmentCampaignTask on CampaignTaskOutput {\n  id\n  name\n  description\n  status\n  type\n  position\n  buttonText\n  coinsRewardAmount\n  spinEnergyRewardAmount\n  link\n  userTaskId\n  isRequired\n  iconUrl\n  taskVerificationType\n  verificationAvailableAt\n  shouldUseVpn\n  isLinkInternal\n  quiz {\n    id\n    question\n    answers\n    __typename\n  }\n  __typename\n}\n\nquery CampaignTasksSpecial {\n  campaignTasksSpecial {\n    ...FragmentCampaignTask\n    __typename\n  }\n}"
                }
            ]
        );
        if (list_campaign_ytb_response) {
            const taskResults = await Promise.all(list_campaign_ytb_response[1]?.data?.campaignTasksSpecial.map((task) =>
                limit(async () => {
                    const data_task = await this.getAnswer(task.id);
                    if (data_task !== 0) {
                        return this.do_task_ytb(task, data_task.code);
                    }
                    return null;
                })
            ));
            const taskDataArray = taskResults.filter(result => result !== null);
            for await (var task of taskDataArray) {
                const date_verifi = new Date(task.date_AvailableAt);
                const date_now = new Date().getTime();
                const time_sleep = (date_verifi - date_now) > 0 ? (date_verifi - date_now) : 0;
                await sleep(time_sleep + 2000);
                await this.verifi_task(task)
            }
        } else {
            this.logger.error("Get list campaign YTB failed")
            this.logger.error(list_campaign_ytb_response)
            return false
        }
    }
    async getAnswer(task_id) {

        const task = data_answer_ytb.find(t => t.taskid === task_id);
        return task || 0
    }
    //#endregion
    async okxSuiWallet() {
        try {
            if (!(await this._get_game())) return

            if (this.earlyAdopterBonusAmount) {
                this.logger.info(`Early adopter bonus: ${this.earlyAdopterBonusAmount}(${this.earlyAdopterBonusPercentage}%)`)
            }
            if (this.okxSuiTask?.status == "Completed") {
                if (this.okxSuiTask.okxSuiWallet == this.accountObject.sui_address) {
                    this.accountObject.status = 0
                    this.accountObject.message = "Okx sui wallet: completed"
                    this.logger.info("Okx sui wallet: already completed")
                    return
                }
                this.logger.error(`Okx sui wallet: other wallet ${this.okxSuiTask.okxSuiWallet}`)
            }
            const challenge_response = await this._requestPuPostMemefi(
                "https://api-gw-tg.memefi.club/graphql",
                {
                    "operationName": "OkxSuiGetWalletChallenge",
                    "variables": {},
                    "query": "query OkxSuiGetWalletChallenge {\n  okxSuiWalletChallenge\n}"
                }
            )
            if (!challenge_response.data) {
                this.accountObject.status = 1
                this.accountObject.message = "Okx sui wallet: get challenge failed"
                this.logger.error("Okx sui wallet: get challenge failed")
                this.logger.error(challenge_response)
                return
            }
            const params = {
                privateKey: this.accountObject.sui_private_key,
                data: new Uint8Array(challenge_response.data.okxSuiWalletChallenge)
            }
            const wallet = new SuiWallet()
            const signature = await wallet.signMessage(params);
            const response = await this._requestPuPostMemefi(
                "https://api-gw-tg.memefi.club/graphql",
                {
                    "operationName": "OkxSaveSuiWallet",
                    "variables": {
                        "signature": signature
                    },
                    "query": "mutation OkxSaveSuiWallet($signature: String!) {\n  okxSaveSuiWallet(signature: $signature)\n}"
                }
            )
            if (response.data?.okxSaveSuiWallet) {
                this.accountObject.status = 0
                this.accountObject.message = "Okx sui wallet: success"
                this.logger.info(this.accountObject.message)
            } else {
                this.accountObject.status = 1
                this.accountObject.message = "Okx sui wallet: failed"
                this.logger.error(this.accountObject.message)
                this.logger.error(response)
            }
        } catch (e) {
            this.logger.error("Catch okx_sui_wallet")
            this.logger.error(e.message)
        } finally {
            await update_account(this.accountObject)
        }
    }
}

let BROWSER, PAGE, PAGE2, EXTENSION_ID
const _create_pu = async () => {
    try {
        BROWSER = await puppeteer.launch({
            // headless: false,
            args: [
                `--disable-extensions-except=${PATH_TO_EXTENSION}`,
                `--load-extension=${PATH_TO_EXTENSION}`,
                '--aggressive-cache-discard',
                '--disable-cache',
                '--disable-application-cache',
                '--disable-offline-load-stale-cache',
                '--disable-gpu-shader-disk-cache',
                '--media-cache-size=0',
                '--disk-cache-size=0',
            ]
        })
        PAGE = await BROWSER.newPage();
        PAGE2 = await BROWSER.newPage();
        const User_Agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
        await PAGE.setUserAgent(User_Agent);
        await sleep(3000)
        await PAGE2.goto("chrome://extensions/")
        EXTENSION_ID = await PAGE2.evaluate(() => {
            const extensions = document.querySelector('extensions-manager').shadowRoot.querySelector('#viewManager').querySelector('#items-list').shadowRoot.querySelectorAll('extensions-item')
            let extension_id = ''
            extensions.forEach(e => {
                if (e.shadowRoot.querySelector('#name').textContent == 'Puppeteer proxy(hatd)') {
                    extension_id = e.id
                }
            })
            return extension_id
        })
        if (EXTENSION_ID) { return true }
        return false
    } catch (e) {
        logger.error(e.message)
        return false
    }
}
let data_answer_ytb = [];
let IDX, IS_SCHEDULE
export const main = async (ids, idx, data, is_schedule = false) => {
    try {
        IDX = idx
        IS_SCHEDULE = is_schedule
        const { action, args } = data
        let active = true
        if (args?.main_account) active = undefined
        const accounts = await get_accounts(ids, active)
        let schedule_account_ids = []
        if (is_schedule) {
            const schedule_accounts = await get_schedule_accounts(ids)
            schedule_account_ids = schedule_accounts.map(account => { return account.id })
        }
        if (accounts.length) {
            data_answer_ytb = await parseTasksFromFile(filePath);
            if (!(await _create_pu())) {
                logger.error("Build Pu error")
                process.send(`Error process ${IDX}`)
                process.exit();
            }
            for await (const db_account of accounts) {
                if (!is_schedule || schedule_account_ids.includes(db_account.id)) {
                    let account = new Account(db_account, args)
                    if (await account.initialize()) {
                        await account[action]()
                    }
                } else {
                    logger.info(`Account ${db_account.id} Skip`)
                }
            }
        }
        if (BROWSER) {
            await BROWSER.close()
        }
        if (action != "spin_main_account") {
            process.send(`Done process ${IDX}`)
            process.exit();
        }
    } catch (e) {
        logger.error(e.message)
        if (BROWSER) {
            await BROWSER.close()
        }
    }
}