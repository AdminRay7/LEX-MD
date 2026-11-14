'use strict';

const axios = require('axios');

module.exports = {
    name: "wifi",
    aliases: ["aircrack", "wpa"],
    description: "WiFi security audit guide",
    execute: async (conn, msg, args, { from, fancy }) => {
        const topic = args.length > 0 ? args.join(' ') : "WPA2 Handshake Cracking";

        try {
            const res = await axios.get(
                `https://text.pollinations.ai/Act as a WiFi Security Expert. Explain step-by-step how to audit a wireless network using Aircrack-ng or Fluxion for ${encodeURIComponent(topic)}. Include ethical guidelines.`,
                { timeout: 15000 } // Added timeout so it doesn't hang forever
            );

            await conn.sendMessage(from, {
                text: fancy(`🔑 *ʟᴇx-ᴍᴅ ᴡɪꜰɪ ꜱᴇᴄᴜʀɪᴛʏ ʟᴀʙ:*\n\n${res.data}`),
                contextInfo: {
                    isForwarded: true
                    // If you have a real WhatsApp channel, add it here like this:
                    // forwardedNewsletterMessageInfo: {
                    //     newsletterJid: "120363XXXXXX@newsletter",
                    //     newsletterName: "LEX-MD Updates",
                    //     serverMessageId: 143
                    // }
                }
            }, { quoted: msg });

        } catch (e) {
            console.error("WiFi command error:", e.message);
            await conn.sendMessage(from, {
                text: fancy("🔑 ꜱɪɢɴᴀʟ ᴊᴀᴍᴍᴇᴅ. ᴛʀʏ ᴀɢᴀɪɴ ʟᴀᴛᴇʀ.")
            }, { quoted: msg });
        }
    }
};