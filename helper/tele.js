
import { TelegramClient, sessions, Api } from "telegram";

export const getIframeUrl = async (app_id, app_hash, session, proxy_url, logger) => {
    logger.info("Login tele")
    try {
        if (session == "") {
            logger.error('Not have TELE_SESSION')
            return
        }
        const string_session = new sessions.StringSession(session)

        const options = {
            autoReconnect: false
        }
        if (proxy_url) {
            const [user_pass, ip_port] = proxy_url.replace('socks5://', '').split("@")
            const [username, password] = user_pass.split(":")
            const [ip, port] = ip_port.split(":")
            const proxy = {
                socksType: 5,
                ip: ip,
                port: parseInt(port),
                username: username,
                password: password,
                timeout: "10000"
            }
            options['proxy'] = proxy
        }
        const client = new TelegramClient(
            string_session,
            parseInt(app_id),
            app_hash,
            options
        )
        client.setLogLevel('none')
        await client.start()
        if (!(await client.checkAuthorization())) return

        const response = await client.invoke(new Api.messages.RequestWebView({
            peer: process.env.BOT_USERNAME,
            bot: process.env.BOT_USERNAME,
            platform: "ios",
            url: process.env.BOT_DOMAIN,
        }));
        await client.destroy()
        if (response && response.url) return response.url

        logger.error('Request webview failed')
        logger.error(response)
    } catch (e) {
        logger.error("Catch login tele")
        logger.error(e.message)
    }
}