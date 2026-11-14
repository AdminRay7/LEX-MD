'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { fancy } = require('../../lib/font');

// Resolve the display prefix — handles string OR array (from handler.js)
const prefixDisplay = Array.isArray(config.prefix) ? (config.prefix[0] || '.') : (config.prefix || '.');

module.exports = {
    name: "menu",
    aliases: ["help", "cmds", "commands", "m"],
    description: "Show all commands grouped by category",
    execute: async (conn, msg, args, { from, sender, pushname }) => {
        try {
            // ---------------- LOAD MENU IMAGE FROM ASSETS ----------------
            const assetsDir = path.join(__dirname, '../../Assets');
            const imageCandidates = ['menu.jpg', 'menu.jpeg', 'menu.png', 'menu.webp', 'menu.gif']
                .map(name => path.join(assetsDir, name));

            let imagePath = null;
            for (const p of imageCandidates) {
                if (fs.existsSync(p)) {
                    imagePath = p;
                    break;
                }
            }

            const imageBuffer = imagePath ? fs.readFileSync(imagePath) : null;

            // ---------------- COLLECT COMMANDS BY CATEGORY ----------------
            const cmdPath = path.join(__dirname, '../../commands');

            if (!fs.existsSync(cmdPath)) {
                throw new Error("Commands folder not found");
            }

            const categories = fs.readdirSync(cmdPath)
                .filter(f => {
                    try { return fs.statSync(path.join(cmdPath, f)).isDirectory(); }
                    catch { return false; }
                })
                .sort();

            let body = "";

            for (const cat of categories) {
                const catPath = path.join(cmdPath, cat);
                const files = fs.readdirSync(catPath).filter(f => f.endsWith('.js'));

                if (files.length === 0) continue;

                body += `\n╭─── • 📁 • ───╮\n`;
                body += `   ${cat.toUpperCase()}\n`;
                body += `╰─── • 📁 • ───╯\n`;

                for (const file of files.sort()) {
                    let primaryName = file.replace('.js', '');
                    try {
                        const mod = require(path.join(catPath, file));
                        primaryName = mod.name || primaryName;
                    } catch { /* fallback to filename */ }

                    // Skip listing the menu itself
                    if (primaryName.toLowerCase() === 'menu') continue;

                    body += `│ ◦ ${prefixDisplay}${primaryName}\n`;
                }
                body += `\n`;
            }

            // ---------------- HEADER ----------------
            const uptime = process.uptime();
            const days = Math.floor(uptime / 86400);
            const hours = Math.floor((uptime % 86400) / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);

            const header =
                `╭─── • 🔑 • ───╮\n` +
                `   ${fancy(config.botName)} ᴠ${config.version}\n` +
                `╰─── • 🔑 • ───╯\n\n` +
                `│ 👑 Owner: ${config.ownerName}\n` +
                `│ ⚙️ Prefix: ${prefixDisplay}\n` +
                `│ ⏱️ Uptime: ${days}d ${hours}h ${minutes}m\n`;

            // ---------------- FOOTER ----------------
            const footer = `\n${config.footer}`;

            const fullMenu = header + body + footer;

            // ---------------- SEND IMAGE + CAPTION (with fallbacks) ----------------
            if (imageBuffer) {
                await conn.sendMessage(from, {
                    image: imageBuffer,
                    caption: fullMenu
                }, { quoted: msg });
            } else if (config.menuImage) {
                await conn.sendMessage(from, {
                    image: { url: config.menuImage },
                    caption: fullMenu
                }, { quoted: msg }).catch(async () => {
                    // if URL image fails too, fall back to text
                    await conn.sendMessage(from, { text: fullMenu }, { quoted: msg });
                });
            } else {
                await conn.sendMessage(from, { text: fullMenu }, { quoted: msg });
            }

        } catch (e) {
            console.error("Menu error:", e);
            await conn.sendMessage(from, {
                text: fancy("❌ Menu error: " + e.message)
            }, { quoted: msg });
        }
    }
};