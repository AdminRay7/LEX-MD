'use strict';

const os = require('os');
const config = require('../../config');
const { fancy } = require('../../lib/font');

module.exports = {
    name: "ping",
    aliases: ["p", "speed", "latency"],
    description: "Check bot response speed and uptime",
    execute: async (conn, msg, args, { from, sender, pushname }) => {
        try {
            if (!conn.user) {
                return conn.sendMessage(from, {
                    text: "⚠️ Bot is reconnecting. Try again in a moment."
                }, { quoted: msg });
            }

            // ---------------- MEASURE LATENCY ----------------
            // Time from when the USER sent the message (end-to-end)
            // plus the time we spent processing in this handler.
            const processStart = Date.now();

            // Extract WhatsApp timestamp (may be Long or number)
            const rawTs = msg.messageTimestamp;
            const userTs = typeof rawTs === 'number'
                ? rawTs
                : (rawTs?.toNumber ? rawTs.toNumber() : Number(rawTs));

            const sent = await conn.sendMessage(from, {
                text: fancy("🏓 Pinging...")
            }, { quoted: msg });

            const processTime = Date.now() - processStart;
            const e2eLatency = Number.isFinite(userTs)
                ? Date.now() - (userTs * 1000)
                : processTime;

            // ---------------- UPTIME ----------------
            const uptime = process.uptime();
            const days    = Math.floor(uptime / 86400);
            const hours   = Math.floor((uptime % 86400) / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);

            // ---------------- MEMORY ----------------
            const mem = process.memoryUsage();
            const rssMB       = (mem.rss / 1024 / 1024).toFixed(2);
            const heapMB      = (mem.heapUsed / 1024 / 1024).toFixed(2);
            const heapTotalMB = (mem.heapTotal / 1024 / 1024).toFixed(2);

            // ---------------- CPU ----------------
            const loadAvg = process.platform === 'win32'
                ? 'N/A'
                : (os.loadavg()[0] || 0).toFixed(2);

            // ---------------- SPEED RATING (based on end-to-end) ----------------
            let speedEmoji = "🟢";
            let speedText  = "Excellent";
            if (e2eLatency > 500)  { speedEmoji = "🟡"; speedText = "Good"; }
            if (e2eLatency > 1500) { speedEmoji = "🟠"; speedText = "Slow"; }
            if (e2eLatency > 3000) { speedEmoji = "🔴"; speedText = "Very Slow"; }

            // ---------------- BUILD MESSAGE ----------------
            const text =
                `╭─── • 🏓 • ───╮\n` +
                `   ${fancy("PONG!")}\n` +
                `╰─── • 🏓 • ───╯\n\n` +
                `│ ⚡ RESPONSE\n` +
                `│ ◦ Latency: ${e2eLatency} ms\n` +
                `│ ◦ Processing: ${processTime} ms\n` +
                `│ ◦ Speed: ${speedEmoji} ${speedText}\n\n` +
                `│ ⏱️ UPTIME\n` +
                `│ ◦ ${days}d ${hours}h ${minutes}m ${seconds}s\n\n` +
                `│ 💻 SYSTEM\n` +
                `│ ◦ RSS: ${rssMB} MB\n` +
                `│ ◦ Heap: ${heapMB} / ${heapTotalMB} MB\n` +
                `│ ◦ CPU Load: ${loadAvg}\n` +
                `│ ◦ Platform: ${process.platform}\n` +
                `│ ◦ Node: ${process.version}\n\n` +
                `│ 👤 USER\n` +
                `│ ◦ ${pushname}\n\n` +
                `└────────────────\n${config.footer}`;

            // ---------------- SEND (edit with fallback) ----------------
            try {
                await conn.sendMessage(from, { text, edit: sent.key });
            } catch (editErr) {
                console.warn("Edit failed, sending new message:", editErr.message);
                await conn.sendMessage(from, { text }, { quoted: msg });
            }

        } catch (e) {
            console.error("Ping error:", e);
            await conn.sendMessage(from, {
                text: fancy("❌ Ping failed: " + e.message)
            }, { quoted: msg }).catch(() => {});
        }
    }
};