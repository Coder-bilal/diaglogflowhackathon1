require('dotenv').config();

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { WebhookClient } = require('dialogflow-fulfillment');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// ────────────────────────────────────────────────
// Environment variables check
// ────────────────────────────────────────────────
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.warn('Missing SUPABASE_URL or SUPABASE_KEY in .env - Database features will be disabled');
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyC0El0Cxp-tAGj1Zx5rZAllypZr4Fzst78";
if (!GEMINI_API_KEY) {
    console.error('Missing GEMINI_API_KEY');
    process.exit(1);
}

// ────────────────────────────────────────────────
// Initialize clients
// ────────────────────────────────────────────────
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
    : null;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const MODEL_NAME = 'gemini-1.5-flash-latest';   // ← updated to latest alias (stable)

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: "bilal317699@gmail.com",
        pass: "khrc vion ltiv hdvi",   // ← App Password — never commit this!
    },
});

// ────────────────────────────────────────────────
// Express setup
// ────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const PORT = process.env.PORT || 5000;

// Simple status route
app.get('/', (req, res) => {
    res.send('Saylani Welfare Dialogflow webhook is running');
});

// Request logging middleware
app.use((req, res, next) => {
    console.log(`Path ${req.path} with Method ${req.method}`);
    next();
});

// ────────────────────────────────────────────────
// Gemini helper function
// ────────────────────────────────────────────────
async function getGeminiResponse(queryText) {
    try {
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const generationConfig = {
            temperature: 0.9,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 250,
        };
        const chat = model.startChat({ generationConfig, history: [] });
        const result = await chat.sendMessage(queryText);
        const response = await result.response;
        return response.text().trim() || "No response generated.";
    } catch (err) {
        console.error('Gemini error:', err);
        return "Sorry, I'm having trouble processing that right now. Please try again.";
    }
}

// ────────────────────────────────────────────────
// Email helper function
// ────────────────────────────────────────────────
async function sendEmailAsync(to, subject, text) {
    const message = {
        from: '"Saylani Welfare Bot" <bilal317699@gmail.com>',
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
// Main webhook endpoint
// ────────────────────────────────────────────────
app.post('/dialogflow', async (req, res) => {
    const agent = new WebhookClient({ request: req, response: res });

    let sessionId = 'unknown';
    if (req.body.session) {
        const parts = req.body.session.split('/');
        sessionId = parts[parts.length - 1] || 'unknown';
    }
    console.log(`Webhook called — session: ${sessionId}`);

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
    // ── Donation Intent (Clean version – no @sys.any assumption) ─────────────────────────────
    // ── Donation Intent (Clean version – no @sys.any assumption) ─────────────────────────────
    async function donation(agent) {
        const params = agent.parameters || {};
        let query = agent.query || "";

        // Extract parameters – custom entity + system entities
        let donationType = params.donation_type || "General";
        let amountRaw = params.amount || null;
        let phone = params.phone || "";
        let email = params.email || "";

        // Fix: Extracts name correctly even if it's an object (sys.person)
        let name = "";
        let rawName = params.name;
        if (rawName) {
            if (typeof rawName === 'object') {
                name = rawName.name || rawName['given-name'] || rawName.displayName || rawName.structValue?.fields?.name?.stringValue || "";
            } else {
                name = String(rawName);
            }
        }

        // Fix: If 'query' is just the email (due to slot filling), use a summary instead
        if (query.includes('@') && !query.includes(' ')) {
            query = `Donation Request (${donationType})`;
        }

        // Clean donation type
        donationType = donationType.trim();
        if (!donationType || donationType.toLowerCase() === "donation" || donationType === "") {
            donationType = "General";
        }

        // Amount ko display ke liye format karo (PKR add kar do)
        let amountDisplay = amountRaw ? `${amountRaw} PKR` : "Not specified";
        let amountForDB = amountRaw ? String(amountRaw) : null;  // TEXT column ke liye string

        // User ko dikhane wala message
        // User ko dikhane wala message
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


        // Background tasks: email + DB
        (async () => {
            // Admin notification
            await sendEmailAsync(
                "bilal317693@gmail.com",
                "New Donation Interest",
                `Type: ${donationType}\n` +
                `Amount: ${amountDisplay}\n` +
                `Name: ${name || '-'}\n` +
                `Phone: ${phone || '-'}\n` +
                `Email: ${email || '-'}\n` +
                `Query: ${query}\n` +
                `Session: ${sessionId}\n` +
                `Time: ${new Date().toISOString()}`
            );

            // User thank-you (agar email diya ho)
            if (email && email.includes("@")) {
                await sendEmailAsync(
                    email,
                    "Shukriya – Saylani Welfare",
                    `Assalam-o-Alaikum ${name || "Dear Supporter"},\n\n` +
                    `Aap ki donation interest note kar li gayi hai.\n` +
                    `Type: ${donationType}\nAmount: ${amountDisplay}\n\n` +
                    `Please donate via: https://saylaniwelfare.com/donate\n\n` +
                    `JazakAllah – Saylani Team`
                );
            }

            // Supabase save
            if (supabase) {
                const row = {
                    donation_type: donationType,
                    amount: amountForDB,
                    name: name || null,
                    phone: phone || null,
                    email: email || null,
                    query_text: query,
                    session_id: sessionId
                };

                const { error } = await supabase.from('donations').insert([row]);
                if (error) console.error("DB insert error:", error);
                else console.log("Donation saved");
            }
        })();

        agent.add(message);
    }

    // ── IT Registration Intent ──────────────────────
    async function itRegistration(agent) {
        // Safer parameter extraction
        const params = agent.parameters || {};

        // Debugging logs
        console.log("IT Registration Params:", JSON.stringify(params, null, 2));

        let person = "Student";
        let rawPerson = params.person;

        // Handle Array case (Dialogflow list parameters)
        if (Array.isArray(rawPerson)) {
            rawPerson = rawPerson.length > 0 ? rawPerson[0] : null;
        }

        if (rawPerson) {
            if (typeof rawPerson === 'object') {
                // Try to find any string property that looks like a name
                person = rawPerson.name || rawPerson['given-name'] || rawPerson.displayName || rawPerson.structValue?.fields?.name?.stringValue || "Student";
            } else {
                person = String(rawPerson);
            }
        }

        // Final fallback if person is somehow still an object/null
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

        // Fire-and-forget: emails + db
        (async () => {
            // Admin notification
            await sendEmailAsync(
                "bilal317693@gmail.com",
                "New Mass IT Registration",
                `Name: ${person}\nCourse: ${course}\nPhone: ${phone}\nEmail: ${email}\nSession: ${sessionId}`
            );

            // Confirmation to student (if email exists)
            if (email && email.includes("@")) {
                await sendEmailAsync(
                    email,
                    "Saylani Mass IT - Registration Received",
                    responseText
                );
            }

            if (supabase) {
                const { error } = await supabase
                    .from('it_registrations')
                    .insert([{
                        name: person,
                        course: course,
                        email: email,
                        phone: phone,
                        // session_id: sessionId, // Column missing in DB
                        // created_at: new Date().toISOString()
                    }]);
                if (error) console.error("Supabase IT insert error:", error);
            }
        })();

        agent.add(responseText);
    }

    // ── Book Appointment ────────────────────────────
    // ── Book Appointment ────────────────────────────
    async function bookAppointment(agent) {
        const params = agent.parameters || {};
        let userDate = params.date;
        let rawText = agent.query || '';
        let finalDate = "not specified";

        // Extract basic contact info if available in parameters
        const email = params.email || "";
        const phone = params.phone || "";

        if (userDate) {
            // sys.date usually gives ISO like "2026-02-15" or object
            if (typeof userDate === 'string') {
                finalDate = userDate;
            } else if (userDate.date) {   // sometimes it's {date: "2026-02-15"}
                finalDate = userDate.date;
            }
        } else {
            // Fallback: try to extract ourselves from raw text
            const lower = rawText.toLowerCase();

            if (lower.includes("tomorrow") || lower.includes("kal")) {
                finalDate = "tomorrow";
            } else if (lower.includes("next monday") || lower.includes("agle monday")) {
                finalDate = "next Monday";
            } else if (/\d{1,2}\s*(january|february|march|april|may|june|july|august|september|october|november|december)/i.test(lower)) {
                // extract number + month with basic regex
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

        // Fire-and-forget: email + db
        (async () => {
            // Admin notification
            await sendEmailAsync(
                "bilal317693@gmail.com",
                "New Appointment Request",
                `Date: ${finalDate}\nEmail: ${email}\nPhone: ${phone}\nQuery: ${rawText}\nSession: ${sessionId}`
            );

            // User confirmation
            if (email && email.includes("@")) {
                await sendEmailAsync(
                    email,
                    "Saylani Appointment Request",
                    responseText
                );
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

    // ── Fallback / Unknown ──────────────────────────
    async function fallback(agent) {
        const queryText = agent.query || req.body?.queryResult?.queryText || "";
        console.log(`Fallback → ${queryText}`);

        if (!queryText.trim()) {
            agent.add("Sorry, I didn't catch that. Could you please say it again?");
            return;
        }

        try {
            const result = await Promise.race([
                getGeminiResponse(queryText),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
            ]);
            agent.add(result);
        } catch (err) {
            console.error("Fallback error:", err);
            agent.add("Sorry, that took longer than expected. " +
                "Could you please rephrase your question?");
        }
    }

    // ── Intent mapping ──────────────────────────────
    const intentMap = new Map();
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
            agent.add("Something went wrong on our side. Please try again later.");
        }
    }
});

// ────────────────────────────────────────────────
// Start server
// ────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}   →   http://localhost:${PORT}/`);
    console.log(`Webhook endpoint:                 /dialogflow`);
});