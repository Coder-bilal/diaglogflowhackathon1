const {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
} = require("@google/generative-ai");
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { WebhookClient } = require('dialogflow-fulfillment');
const { createClient } = require('@supabase/supabase-js');

const MODEL_NAME = "gemini-flash-latest";
const API_KEY = process.env.GEMINI_API_KEY;

// ────────────────────────────────────────────────
// Database & Email Configuration
// ────────────────────────────────────────────────
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
    : null;

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.GMAIL_USER || "bilal317699@gmail.com", // Fallback for testing, but setup Env Var in Vercel
        pass: process.env.GMAIL_PASS || "khrc vion ltiv hdvi",
    },
});

// ────────────────────────────────────────────────
// Gemini Configuration (User's Implementation)
// ────────────────────────────────────────────────
async function runChat(queryText) {
    try {
        const genAI = new GoogleGenerativeAI(API_KEY);
        // console.log(genAI)
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const generationConfig = {
            temperature: 1,
            topK: 0,
            topP: 0.95,
            maxOutputTokens: 200,
        };

        const chat = model.startChat({
            generationConfig,
            history: [
            ],
        });

        const result = await chat.sendMessage(queryText);
        const response = result.response;
        return response.text();
    } catch (error) {
        console.error("Gemini Error:", error);
        return "Sorry, I am having trouble connecting to the AI server. Please try again later.";
    }
}

async function sendEmailAsync(to, subject, text) {
    const message = {
        from: '"Digital Welfare Bot" <bilal317699@gmail.com>',
        to,
        subject,
        text,
        html: text.replace(/\n/g, "<br>"),
    };

    try {
        const info = await transporter.sendMail(message);
        console.log(`Email sent to ${to} →`, info.messageId);
    } catch (err) {
        console.error('Failed to send email:', err);
    }
}

// ────────────────────────────────────────────────
// Express App Setup
// ────────────────────────────────────────────────
const webApp = express();
const PORT = process.env.PORT || 6000; // Keeping 6000 as per user's running process

webApp.use(express.urlencoded({
    extended: true
}));
webApp.use(express.json());
webApp.use(cors());

webApp.use((req, res, next) => {
    console.log(`Path ${req.path} with Method ${req.method}`);
    next();
});

webApp.get('/', (req, res) => {
    res.send("Digital Welfare Dialogflow webhook is running");
});

// ────────────────────────────────────────────────
// Webhook Endpoint
// ────────────────────────────────────────────────
webApp.post('/dialogflow', async (req, res) => {

    // Safe Session ID Parsing for Vercel & Dialogflow
    const session = req.body.session || '';
    const id = session.split('/').pop() || 'unknown';
    console.log(`Session ID: ${id}`);

    const agent = new WebhookClient({
        request: req,
        response: res
    });

   // ── Intent Functions ────────────────────────────

   async function fallback() {
        let action = req.body.queryResult.action;
        let queryText = req.body.queryResult.queryText;

        if (action === 'input.unknown') {
            let result = await runChat(queryText);
            agent.add(result);
            console.log(result)
        } else {
            let result = await runChat(queryText);
            agent.add(result);
            console.log(result)
        }
    }

    // ── Welcome ─────────────────────────────────────
    function welcome(agent) {
        agent.add("Assalam-o-Alaikum! Welcome to Saylani Welfare. " +
            "I am your virtual assistant. How may I assist you today?\n\n" +
            "You can ask about:\n• Roti Bank\n• Donations\n• Mass IT Training\n• Locations\n• Appointments");
    }

    // ── Roti Bank Info ──────────────────────────────
    function rotiBankInfo(agent) {
        agent.add("Saylani Roti Bank is our flagship hunger relief program.\n" +
            "We provide free meals to over 300,000 people daily across 630+ locations in Pakistan.");
    }

    // ── Roti Bank Locations ─────────────────────────
    function locations(agent) {
        agent.add("Saylani has centers in major cities: Karachi, Lahore, Islamabad, Faisalabad, Hyderabad, and many more.\n\n" +
            "For the nearest center, please call our UAN: 111-729-526");
    }

    // ── Donation Intent ─────────────────────────────
    async function donation(agent) {
        const params = agent.parameters || {};
        let query = agent.query || "";

        let donationType = params.donation_type || "General";
        let amountRaw = params.amount || null;
        let phone = params.phone || "";
        let email = params.email || "";

        let name = "";
        let rawName = params.name;
        if (rawName) {
            if (typeof rawName === 'object') {
                name = rawName.name || rawName['given-name'] || rawName.displayName || rawName.structValue?.fields?.name?.stringValue || "";
            } else {
                name = String(rawName);
            }
        }

        if (query.includes('@') && !query.includes(' ')) {
            query = `Donation Request (${donationType})`;
        }

        donationType = donationType.trim();
        if (!donationType || donationType.toLowerCase() === "donation" || donationType === "") {
            donationType = "General";
        }

        let amountDisplay = amountRaw ? `${amountRaw} PKR` : "Not specified";
        let amountForDB = amountRaw ? String(amountRaw) : null;

        let message = `💚 **Thank You!**\n` +
            `We have noted your donation request. Your support means a lot!\n\n` +
            `📋 **Details:**\n` +
            `• **Type:** ${donationType}\n` +
            `• **Amount:** ${amountDisplay}\n`;

        if (name) message += `• **Name:** ${name}\n`;
        if (phone) message += `• **Phone:** ${phone}\n`;
        if (email) message += `• **Email:** ${email}\n`;

        message += `\nTo complete your donation, please visit:\n` +
            `👉 [saylaniwelfare.com/donate](https://saylaniwelfare.com/donate)\n\n` +
            `Or call **111-729-526** for assistance.`;

        (async () => {
            await sendEmailAsync(
                "bilal317693@gmail.com",
                "New Donation Interest",
                `Type: ${donationType}\nAmount: ${amountDisplay}\nName: ${name || '-'}\nPhone: ${phone || '-'}\nEmail: ${email || '-'}\nQuery: ${query}\nSession: ${id}`
            );

            if (email && email.includes("@")) {
                await sendEmailAsync(
                    email,
                    "Shukriya – Saylani Welfare",
                    `Assalam-o-Alaikum ${name || "Dear Supporter"},\n\nAap ki donation interest note kar li gayi hai.\nType: ${donationType}\nAmount: ${amountDisplay}\n\nPlease donate via: https://saylaniwelfare.com/donate\n\nJazakAllah – Saylani Team`
                );
            }

            if (supabase) {
                const { error } = await supabase.from('donations').insert([{
                    donation_type: donationType,
                    amount: amountForDB,
                    name: name || null,
                    phone: phone || null,
                    email: email || null,
                    query_text: query,
                    session_id: id
                }]);
                if (error) console.error("DB insert error:", error);
            }
        })();

        agent.add(message);
    }

    // ── IT Registration Intent ──────────────────────
    async function itRegistration(agent) {
        const params = agent.parameters || {};
        let person = "Student";
        let rawPerson = params.person;

        if (Array.isArray(rawPerson)) {
            rawPerson = rawPerson.length > 0 ? rawPerson[0] : null;
        }

        if (rawPerson) {
            if (typeof rawPerson === 'object') {
                person = rawPerson.name || rawPerson['given-name'] || rawPerson.displayName || rawPerson.structValue?.fields?.name?.stringValue || "Student";
            } else {
                person = String(rawPerson);
            }
        }

        if (typeof person !== 'string' || person === "[object Object]") {
            person = "Student";
        }

        const course = params.Courses || params.course || "Unknown Course";
        const email = params.email || "";
        const phone = params.phone || "";

        const responseText = `Thank you, ${person}!\n` +
            `We have received your interest in the **${course}** course.\n` +
            `Our team will contact you soon at:\n` +
            `• Phone: ${phone || "—"} \n` +
            `• Email: ${email || "—"} \n\n` +
            `JazakAllah for choosing Saylani Mass IT Training!`;

        (async () => {
            await sendEmailAsync(
                "bilal317693@gmail.com",
                "New Mass IT Registration",
                `Name: ${person}\nCourse: ${course}\nPhone: ${phone}\nEmail: ${email}\nSession: ${id}`
            );

            if (email && email.includes("@")) {
                await sendEmailAsync(email, "Saylani Mass IT - Registration Received", responseText);
            }

            if (supabase) {
                const { error } = await supabase
                    .from('it_registrations')
                    .insert([{
                        name: person,
                        course: course,
                        email: email,
                        phone: phone,
                    }]);
                if (error) console.error("Supabase IT insert error:", error);
            }
        })();

        agent.add(responseText);
    }

    // ── Book Appointment ────────────────────────────
    async function bookAppointment(agent) {
        const params = agent.parameters || {};
        let userDate = params.date;
        let rawText = agent.query || '';
        let finalDate = "not specified";
        const email = params.email || "";
        const phone = params.phone || "";

        if (userDate) {
            if (typeof userDate === 'string') {
                finalDate = userDate;
            } else if (userDate.date) {
                finalDate = userDate.date;
            }
        } else {
            const lower = rawText.toLowerCase();
            if (lower.includes("tomorrow") || lower.includes("kal")) {
                finalDate = "tomorrow";
            } else if (lower.includes("next monday") || lower.includes("agle monday")) {
                finalDate = "next Monday";
            } else if (/\d{1,2}\s*(january|february|march|april|may|june|july|august|september|october|november|december)/i.test(lower)) {
                const match = lower.match(/(\d{1,2})\s*(january|february|march|april|may|june|july|august|september|october|november|december)/i);
                if (match) {
                    finalDate = `${match[1]} ${match[2]}`;
                }
            }
        }

        const responseText = `🗓️ Appointment booking request received!\n\n` +
            `Selected date: **${finalDate}**\n` +
            (email ? `Email: ${email}\n` : "") +
            (phone ? `Phone: ${phone}\n` : "") +
            `\nWe have noted your request. Please call 111-729-526 to confirm and book.\n` +
            `Or visit nearest Saylani center.`;

        (async () => {
            await sendEmailAsync(
                "bilal317693@gmail.com",
                "New Appointment Request",
                `Date: ${finalDate}\nEmail: ${email}\nPhone: ${phone}\nQuery: ${rawText}\nSession: ${id}`
            );

            if (email && email.includes("@")) {
                await sendEmailAsync(email, "Saylani Appointment Request", responseText);
            }

            if (supabase) {
                const { error } = await supabase
                    .from('appointments')
                    .insert([{
                        date: finalDate,
                        email: email,
                        phone: phone,
                        query_text: rawText
                    }]);
                if (error) console.error("Supabase appointment insert error:", error);
            }
        })();

        agent.add(responseText);
    }

 // ── Intent Mapping ──────────────────────────────
    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('RotiBank_Info', rotiBankInfo);
    intentMap.set('RotiBank_Location', locations);
    intentMap.set('RotiBank_Donate', donation);
    intentMap.set('IT_Registration', itRegistration);
    intentMap.set('BookAppointment', bookAppointment);

    try {
        await agent.handleRequest(intentMap);
    } catch (err) {
        console.error("Webhook critical error:", err);
        if (!res.headersSent) {
            res.status(500).send("Internal Server Error");
        }
    }
});

webApp.listen(PORT, () => {
    console.log(`Server running on port ${PORT}   →   http://localhost:${PORT}/`);
});