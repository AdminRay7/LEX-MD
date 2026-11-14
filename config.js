'use strict';

require('dotenv').config();

module.exports = {
    botName: "LEX-MD",
    ownerNumber: process.env.OWNER_NUMBER || "254794376595",
    ownerName:   process.env.OWNER_NAME   || "Charles_10",
    version:     "2.1.1",
    footer:      "LEX-MD",
    prefix:      process.env.PREFIX || ".",

    sessionName: process.env.SESSION_NAME || "insidious_session",

    mongodb: process.env.MONGODB_URI ||
        "mongodb+srv://ryanraybot_db_user:mljhRdHoeVIB9gZa@cluster0.ng7nkwm.mongodb.net/?appName=Cluster0",

    apiKey: process.env.API_KEY || "changeme-please-rotate-this-key",

    aiModel: process.env.AI_MODEL || "https://ai.servietsky1.workers.chat/?message=",

    newsletterJid: process.env.NEWSLETTER_JID || "",
    channelLink:   process.env.CHANNEL_LINK   || "",

    autoRead:   process.env.AUTO_READ   === "true",
    autoReact:  process.env.AUTO_REACT  === "true",
    autoSave:   process.env.AUTO_SAVE   === "true",
    autoTyping: process.env.AUTO_TYPING === "true",
    autoBio:    process.env.AUTO_BIO    === "true",
    anticall:   process.env.ANTICALL    === "true",
    antibug:    process.env.ANTIBUG     === "true",
    antispam:   process.env.ANTISPAM    === "true",
    antilink:   process.env.ANTILINK    === "true",
    antiscam:   process.env.ANTISCAM    === "true",
    antiporn:   process.env.ANTIPORN    === "true",
    antitag:    false,
    antimedia:  "off",
    antidelete: true,
    workMode:   process.env.WORK_MODE || "public",

    autoStatus: {
        view:  process.env.AUTO_STATUS_VIEW  === "true",
        like:  process.env.AUTO_STATUS_LIKE  === "true",
        reply: process.env.AUTO_STATUS_REPLY === "true"
    },

    autoblock: (process.env.AUTOBLOCK || "").split(",").map(s => s.trim()).filter(Boolean),

    scamWords: ["free money", "lottery", "winner", "cash prize"],
    pornWords: ["porn", "xxx", "adult", "nude", "sex"],

    sleepStart: process.env.SLEEP_START || "23:00",
    sleepEnd:   process.env.SLEEP_END   || "06:00",
    groupJid:   "",

    menuImage: "https://telegra.ph/file/5f6b3c7a8d9e0f1a2b3c.jpg"
};