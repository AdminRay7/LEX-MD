'use strict';

const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const config = require('./config');
const { fancy } = require('./lib/font');
const { User, ChannelSubscriber } = require('./database/models');
const messageStore = require('./lib/messageStore');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function normalizeJid(input, suffix = '@s.whatsapp.net') {
    const clean = String(input || '').replace(/[^0-9]/g, '');
    if (clean.length < 7) throw new Error('Invalid phone number');
    return clean + suffix;
}

function jidToNumber(jid) {
    return String(jid || '').split('@')[0].replace(/[^0-9]/g, '');
}

const OWNER_NUMBERS = (Array.isArray(config.ownerNumber)
    ? config.ownerNumber
    : String(config.ownerNumber || '').split(',')
).map(n => String(n).replace(/[^0-9]/g, '')).filter(Boolean);

const OWNER_JID = OWNER_NUMBERS[0] ? OWNER_NUMBERS[0] + '@s.whatsapp.net' : null;

const PREFIXES = (Array.isArray(config.prefix)
    ? config.prefix
    : [config.prefix]
).map(String).filter(Boolean);

const BUG_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u00AD\u2028\u2029]/;

const SCAM_WORDS = Array.isArray(config.scamWords) ? config.scamWords.map(w => String(w).toLowerCase()) : [];
const PORN_WORDS = Array.isArray(config.pornWords) ? config.pornWords.map(w => String(w).toLowerCase()) : [];
const AUTOBLOCK = Array.isArray(config.autoblock) ? config.autoblock.map(String) : [];

function getMessageBody(msg) {
    const m = msg.message || {};
    return (
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        m.documentMessage?.caption ||
        m.audioMessage?.caption ||
        ''
    );
}

function isRevokeMessage(msg) {
    const m = msg.message || {};
    return m.protocolMessage?.type === 0 && !!m.protocolMessage?.key;
}

async function safeSend(conn, jid, content, options) {
    try {
        return await conn.sendMessage(jid, content, options);
    } catch (e) {
        console.error(`safeSend to ${jid} failed:`, e.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
// COMMAND CACHE
// ═══════════════════════════════════════════════════════════════

const commandCache = new Map();
let cacheLoaded = false;

function loadCommands() {
    if (cacheLoaded) return;
    const cmdPath = path.join(__dirname, 'commands');
    if (!fs.existsSync(cmdPath)) return;

    const walk = (dir) => {
        for (const item of fs.readdirSync(dir)) {
            const itemPath = path.join(dir, item);
            if (fs.statSync(itemPath).isDirectory()) {
                walk(itemPath);
            } else if (item.endsWith('.js')) {
                try {
                    const mod = require(itemPath);
                    if (!mod || typeof mod.execute !== 'function') return;
                    const names = [
                        mod.name,
                        ...(Array.isArray(mod.aliases) ? mod.aliases : [])
                    ].filter(Boolean).map(s => String(s).toLowerCase());
                    for (const n of names) commandCache.set(n, mod);
                } catch (e) {
                    console.error(`⚠️ Failed to load ${itemPath}:`, e.message);
                }
            }
        }
    };

    walk(cmdPath);
    cacheLoaded = true;
    console.log(`✅ Loaded ${commandCache.size} commands into cache.`);
}

loadCommands();

// ═══════════════════════════════════════════════════════════════
// ANTIDELETE — replay
// ═══════════════════════════════════════════════════════════════

async function replayStoredMessage(conn, from, stored) {
    const om = stored?.msg;
    if (!om || !om.message) return false;

    const text =
        om.message.conversation ||
        om.message.extendedTextMessage?.text ||
        om.message.imageMessage?.caption ||
        om.message.videoMessage?.caption;

    if (text) {
        await safeSend(conn, from, { text: `📄 ᴅᴇʟᴇᴛᴇᴅ ᴍᴇꜱꜱᴀɢᴇ:\n\n${text}` });
        return true;
    }

    try {
        if (om.message.imageMessage) {
            const buf = await downloadMediaMessage(om, 'buffer', {});
            await safeSend(conn, from, { image: buf, caption: '📷 ᴅᴇʟᴇᴛᴇᴅ ɪᴍᴀɢᴇ' });
            return true;
        }
        if (om.message.videoMessage) {
            const buf = await downloadMediaMessage(om, 'buffer', {});
            await safeSend(conn, from, { video: buf, caption: '🎥 ᴅᴇʟᴇᴛᴇᴅ ᴠɪᴅᴇᴏ' });
            return true;
        }
        if (om.message.stickerMessage) {
            const buf = await downloadMediaMessage(om, 'buffer', {});
            await safeSend(conn, from, { sticker: buf });
            return true;
        }
        if (om.message.audioMessage) {
            const buf = await downloadMediaMessage(om, 'buffer', {});
            await safeSend(conn, from, {
                audio: buf,
                mimetype: 'audio/mp4',
                ptt: om.message.audioMessage.ptt || false
            });
            return true;
        }
        if (om.message.documentMessage) {
            const buf = await downloadMediaMessage(om, 'buffer', {});
            await safeSend(conn, from, {
                document: buf,
                mimetype: om.message.documentMessage.mimetype || 'application/octet-stream',
                fileName: om.message.documentMessage.fileName || 'document'
            });
            return true;
        }
    } catch (e) {
        console.error('replayStoredMessage media error:', e.message);
    }
    return false;
}

// ═══════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════

module.exports = async function handler(conn, msg, userId = 'default') {
    try {
        if (!msg || !msg.message) return;

        const from      = msg.key.remoteJid;
        const type      = Object.keys(msg.message)[0];
        const sender    = msg.key.participant || msg.key.remoteJid;
        const pushname  = msg.pushName || 'Unknown Soul';
        const senderNum = jidToNumber(sender);
        const isGroup   = typeof from === 'string' && from.endsWith('@g.us');
        const isOwner   = OWNER_NUMBERS.includes(senderNum) || !!msg.key.fromMe;
        const body      = getMessageBody(msg);

        let usedPrefix = null;
        if (body && PREFIXES.length) {
            usedPrefix = PREFIXES.find(p => body.startsWith(p)) || null;
        }
        const isCmd   = !!usedPrefix;
        const stripped = isCmd ? body.slice(usedPrefix.length).trim() : '';
        const command = isCmd ? stripped.split(/\s+/)[0].toLowerCase() : '';
        const args    = isCmd ? stripped.split(/\s+/).slice(1) : [];

        if (config.newsletterJid && from === config.newsletterJid) return;

        if (config.workMode === 'private' && !isOwner) return;

        const isProtocol = type === 'protocolMessage';
        if (config.antidelete && msg.key?.id && !msg.key.fromMe && !isProtocol) {
            try {
                messageStore.save(msg.key.id, {
                    msg, from, sender, pushname, userId,
                    timestamp: Date.now()
                });
            } catch (e) { /* silent */ }
        }

        if (isProtocol && isRevokeMessage(msg)) {
            if (config.antidelete) {
                try {
                    const deletedKey = msg.message.protocolMessage.key;
                    const original = messageStore.get(deletedKey.id);

                    if (original) {
                        const who = msg.key.participant || msg.key.remoteJid;
                        const whoNumber = jidToNumber(who);

                        await safeSend(conn, from, {
                            text: fancy(`🚨 ᴀɴᴛɪᴅᴇʟᴇᴛᴇ\n@${whoNumber} deleted a message:`),
                            mentions: [who]
                        });

                        await replayStoredMessage(conn, from, original);

                        if (OWNER_JID && senderNum !== OWNER_NUMBERS[0]) {
                            const originalText =
                                original.msg?.message?.conversation ||
                                original.msg?.message?.extendedTextMessage?.text ||
                                '[media]';
                            await safeSend(conn, OWNER_JID, {
                                text: `🚨 ᴀɴᴛɪᴅᴇʟᴇᴛᴇ ʟᴏɢ\n\nFrom: ${pushname} (${sender})\nChat: ${from}\nSession: ${userId}\n\nDeleted: ${originalText}`
                            });
                        }

                        messageStore.remove(deletedKey.id);
                    }
                } catch (e) {
                    console.error('Antidelete error:', e);
                }
            }
            return;
        }

        if (config.autoRead) {
            try { await conn.readMessages([msg.key]); }
            catch (e) { console.error('Auto read error:', e.message); }
        }

        if (config.autoReact && !msg.key.fromMe && !isGroup) {
            try {
                const r = ['🥀', '❤️', '🔥', '⭐', '✨'][Math.floor(Math.random() * 5)];
                await conn.sendMessage(from, { react: { text: r, key: msg.key } });
            } catch (e) { console.error('Auto react error:', e.message); }
        }

        if (config.autoSave && !isOwner && !isGroup) {
            try {
                const now = new Date();
                await User.updateOne(
                    { jid: sender },
                    {
                        $set: { name: pushname, sessionId: userId, lastActive: now },
                        $inc: { messageCount: 1 },
                        $setOnInsert: { jid: sender }
                    },
                    { upsert: true }
                );
            } catch (e) { /* silent */ }
        }

        if (!isOwner && !isGroup && config.channelLink) {
            try {
                const sub = await ChannelSubscriber.findOne({ jid: sender });
                if (!sub) {
                    await ChannelSubscriber.create({
                        jid: sender,
                        name: pushname,
                        subscribedAt: new Date(),
                        isActive: true,
                        autoFollow: true
                    });
                } else {
                    sub.lastActive = new Date();
                    await sub.save();
                }
            } catch (e) {
                console.error('Channel subscription error:', e.message);
            }
        }

        if (config.antibug && body && BUG_RE.test(body)) {
            try {
                await conn.sendMessage(from, { delete: msg.key });
                await safeSend(conn, from, {
                    text: fancy(`🚫 ʙᴜɢ ᴅᴇᴛᴇᴄᴛᴇᴅ\n@${senderNum} sent malicious content`),
                    mentions: [sender]
                });
            } catch (e) {
                console.error('Antibug error:', e.message);
            }
            return;
        }

        if (config.antispam && !isOwner && !isCmd) {
            try {
                const user = await User.findOne({ jid: sender });
                if (user) {
                    const now = Date.now();
                    const diff = now - (user.lastMessageTime || 0);

                    if (diff < 60000) {
                        user.spamCount = (user.spamCount || 0) + 1;

                        if (user.spamCount >= 5) {
                            if (isGroup) {
                                await conn.groupParticipantsUpdate(from, [sender], 'remove')
                                    .catch(e => console.error('Group remove failed:', e.message));
                                await safeSend(conn, from, {
                                    text: fancy(`🚫 ꜱᴘᴀᴍᴍᴇʀ ʀᴇᴍᴏᴠᴇᴅ\n@${senderNum} removed for spamming`),
                                    mentions: [sender]
                                });
                            } else {
                                await conn.updateBlockStatus(sender, 'block')
                                    .catch(e => console.error('Block failed:', e.message));
                            }
                            user.spamCount = 0;
                        }
                    } else {
                        user.spamCount = 0;
                    }

                    user.lastMessageTime = now;
                    await user.save();
                }
            } catch (e) {
                console.error('Antispam error:', e.message);
            }
        }

        if (AUTOBLOCK.length > 0 && !isOwner) {
            const code = senderNum.substring(0, 3);
            if (AUTOBLOCK.includes(code)) {
                try { await conn.updateBlockStatus(sender, 'block'); }
                catch (e) { console.error('Autoblock error:', e.message); }
                return;
            }
        }

        if (isGroup && !isOwner) {
            if (config.antilink && body && /https?:\/\//i.test(body)) {
                try {
                    await conn.sendMessage(from, { delete: msg.key });
                    await safeSend(conn, from, {
                        text: fancy(`⚠️ ᴀɴᴛɪʟɪɴᴋ\n@${senderNum} links not allowed`),
                        mentions: [sender]
                    });
                } catch (e) { console.error('Antilink error:', e.message); }
                return;
            }

            if (config.antiscam && body && SCAM_WORDS.some(w => body.toLowerCase().includes(w))) {
                try {
                    await conn.sendMessage(from, { delete: msg.key });
                    await safeSend(conn, from, {
                        text: fancy(`⚠️ ꜱᴄᴀᴍ ᴀʟᴇʀᴛ!\n@${senderNum} sent scam content`),
                        mentions: [sender]
                    });
                } catch (e) { console.error('Antiscam error:', e.message); }
                return;
            }

            if (config.antiporn && body && PORN_WORDS.some(w => body.toLowerCase().includes(w))) {
                try {
                    await conn.sendMessage(from, { delete: msg.key });
                    await safeSend(conn, from, {
                        text: fancy(`🚫 ᴀɴᴛɪᴘᴏʀɴ\n@${senderNum} content deleted`),
                        mentions: [sender]
                    });
                } catch (e) { console.error('Antiporn error:', e.message); }
                return;
            }

            if (config.antimedia && config.antimedia !== 'off') {
                const mediaMap = {
                    imageMessage: 'photo',
                    videoMessage: 'video',
                    stickerMessage: 'sticker'
                };
                const kind = mediaMap[type];
                if (kind && (config.antimedia === 'all' || config.antimedia === kind)) {
                    try {
                        await conn.sendMessage(from, { delete: msg.key });
                        await safeSend(conn, from, {
                            text: fancy(`🚫 ᴀɴᴛɪᴍᴇᴅɪᴀ\n${kind} not allowed`),
                            mentions: [sender]
                        });
                    } catch (e) { console.error('Antimedia error:', e.message); }
                    return;
                }
            }
        }

        if (
            !isCmd &&
            !msg.key.fromMe &&
            !isGroup &&
            body &&
            body.trim().length > 1 &&
            config.aiModel
        ) {
            if (config.autoTyping) {
                try { await conn.sendPresenceUpdate('composing', from); }
                catch { /* silent */ }
            }

            try {
                const aiRes = await axios.get(
                    `${config.aiModel}${encodeURIComponent(body)}`,
                    { timeout: 15000 }
                );

                const raw = aiRes.data;
                const aiText =
                    typeof raw === 'string' ? raw
                    : raw?.result ?? raw?.response ?? raw?.message ?? raw?.answer
                    ?? JSON.stringify(raw);

                const response =
                    `╭─── • 🔑 • ───╮\n` +
                    `   ʟ ᴇ x - ᴍ ᴅ\n` +
                    `╰─── • 🔑 • ───╯\n\n` +
                    `${fancy(String(aiText))}\n\n` +
                    `_ᴅᴇᴠᴇʟᴏᴘᴇʀ: ᴄʜᴀʀʟᴇꜱ_10_`;

                await conn.sendMessage(from, { text: response }, { quoted: msg });
            } catch (e) {
                console.error('AI error:', e.message);
            }
        }

        if (isCmd) {
            const cmdHandler = commandCache.get(command);

            if (cmdHandler && typeof cmdHandler.execute === 'function') {
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Command timeout')), 30000)
                );

                try {
                    await Promise.race([
                        cmdHandler.execute(conn, msg, args, {
                            from,
                            sender,
                            fancy,
                            isOwner,
                            pushname,
                            config,
                            conn,
                            msg,
                            userId,
                            command,
                            prefix: usedPrefix
                        }),
                        timeoutPromise
                    ]);
                } catch (cmdErr) {
                    console.error(`Command "${command}" error:`, cmdErr);
                    await safeSend(conn, from, {
                        text: fancy(`❌ Command error: ${cmdErr.message}`)
                    });
                }
            } else if (command !== 'menu') {
                await safeSend(conn, from, {
                    text: fancy(`❌ Command "${command}" not found.\n\n📋 Type ${PREFIXES[0] || '!'}menu for available commands.`)
                });
            }
        }

    } catch (err) {
        console.error('Handler Error:', err);
    }
};