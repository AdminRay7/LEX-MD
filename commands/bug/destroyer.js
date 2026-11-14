'use strict';

const axios = require('axios');

module.exports = {
    name: "phish",
    description: "Educational guide on phishing awareness",
    execute: async (conn, msg, args, { from, fancy }) => {
        const platform = args[0] || "Facebook/Instagram";
        
        try {
            const res = await axios.get(
                `https://text.pollinations.ai/Explain how a phishing attack works for ${platform}. Include technical details about fake login pages and how to detect them. Respond in the user's language.`,
                { timeout: 15000 } // Added timeout to prevent freezing
            );
            
            await conn.sendMessage(from, { 
                text: fancy(`🔑 *ʟᴇx-ᴍᴅ ᴘʜɪꜱʜɪɴɢ ᴀᴡᴀʀᴇɴᴇꜱꜱ:*\n\n${res.data}`) 
            }, { quoted: msg });

        } catch (e) { 
            console.error("Phish command error:", e.message);
            // Fixed: msg.reply doesn't exist in Baileys, used standard sendMessage
            await conn.sendMessage(from, { 
                text: fancy("🔑 ɪɴꜰᴏ ʟᴏꜱᴛ. ꜱᴇʀᴠᴇʀ ᴍᴀʏ ʙᴇ ᴅᴏᴡɴ.") 
            }, { quoted: msg }); 
        }
    }
};