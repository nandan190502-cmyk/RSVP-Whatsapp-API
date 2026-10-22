const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// --- CONFIGURATION (Replace with your Meta details) ---
const VERIFY_TOKEN = "my_free_rsvp_token_123";
const WHATSAPP_TOKEN = "YOUR_META_PERMANENT_OR_TEMP_ACCESS_TOKEN";
const PHONE_NUMBER_ID = "YOUR_META_PHONE_NUMBER_ID";
const GOOGLE_SHEET_WEBHOOK_URL = "YOUR_FREE_GOOGLE_APPS_SCRIPT_URL"; // Optional: for cloud saving

// 1. Meta Webhook Verification
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// 2. Handle Incoming Guest Replies
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const message = value?.messages?.[0];
        const contact = value?.contacts?.[0];

        if (message && message.type === 'text') {
            const guestPhone = message.from; // e.g., "1234567890"
            const guestName = contact?.profile?.name || "Unknown Guest"; // WhatsApp Profile Name
            const textResponse = message.text.body.trim().toLowerCase();

            let rsvpStatus = "";
            let replyMessage = "";

            if (textResponse.includes('yes')) {
                rsvpStatus = "Attending";
                replyMessage = `Thanks ${guestName}! 🎉 We've marked you down as ATTENDING. See you there!`;
            } else if (textResponse.includes('no')) {
                rsvpStatus = "Not Attending";
                replyMessage = `Thanks ${guestName}. We're sorry you can't make it, hope to see you next time!`;
            } else {
                // Ignore or handle other messages
                return res.sendStatus(200);
            }

            console.log(`[RSVP Saved] Name: ${guestName} | Phone: ${guestPhone} | Response: ${rsvpStatus}`);

            // Save to Cloud (Google Sheets / Database)
            await saveToCloudDatabase(guestName, guestPhone, rsvpStatus);

            // Send Automated Thank You / Confirmation Message
            await sendWhatsAppMessage(guestPhone, replyMessage);
        }

        res.sendStatus(200);
    } catch (err) {
        console.error("Webhook Error:", err);
        res.sendStatus(500);
    }
});

// Helper: Send WhatsApp Message back to guest
async function sendWhatsAppMessage(toPhone, messageText) {
    try {
        await axios.post(
            `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: toPhone,
                type: "text",
                text: { body: messageText }
            },
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
    } catch (error) {
        console.error("Failed to send WhatsApp reply:", error.response?.data || error.message);
    }
}

// Helper: Save RSVP data to Cloud (e.g., Free Google Sheet)
async function saveToCloudDatabase(name, phone, response) {
    if (!GOOGLE_SHEET_WEBHOOK_URL || GOOGLE_SHEET_WEBHOOK_URL.includes("YOUR_")) return;
    try {
        await axios.post(GOOGLE_SHEET_WEBHOOK_URL, {
            name: name,
            phone: phone,
            response: response,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("Cloud save error:", error.message);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Free RSVP API running on port ${PORT}`));