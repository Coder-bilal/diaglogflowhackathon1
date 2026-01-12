require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const { WebhookClient, Payload } = require('dialogflow-fulfillment');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// ────────────────────────────────────────────────
//  Environment variables check
// ────────────────────────────────────────────────
// Note: We use process.env.SUPABASE_URL if available, otherwise we log a warning but don't exit to allow partial functionality
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.warn('Missing SUPABASE_URL or SUPABASE_KEY in .env - Database features will be disabled');
}

// Hardcoded API Key for Gemini as per original file, though env var is preferred
const GEMINI_API_KEY = "AIzaSyC0El0Cxp-tAGj1Zx5rZAllypZr4Fzst78";
if (!GEMINI_API_KEY) {
    console.error('Missing GEMINI_API_KEY');
    process.exit(1);
}

// ────────────────────────────────────────────────
//  Initialize clients
// ────────────────────────────────────────────────
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
    : null;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const MODEL_NAME = 'gemini-1.5-flash';

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: "bilal317699@gmail.com",
        pass: "khrc vion ltiv hdvi",
    },
});

// Verify transporter (only once on startup)
transporter.verify((error) => {
    if (error) {
        console.error('Email transporter error:', error);
    } else {
        console.log('Email transporter is ready');
    }
});

// ────────────────────────────────────────────────
//  Express setup
// ────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static('public'));

const PORT = process.env.PORT || 5000;

// Simple status route
app.get('/', (req, res) => {
    res.send('Dialogflow + Gemini + Supabase + Email webhook server is running');
});

// Middleware to log requests (from your original code)
app.use((req, res, next) => {
    console.log(`Path ${req.path} with Method ${req.method}`);
    next();
});

// ────────────────────────────────────────────────
//  Gemini helper function
// ────────────────────────────────────────────────
async function getGeminiResponse(queryText) {
    try {
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const generationConfig = {
            temperature: 1,
            topK: 0,
            topP: 0.95,
            maxOutputTokens: 200,
        };

        const chat = model.startChat({ generationConfig, history: [] });

        const result = await chat.sendMessage(queryText);
        const response = await result.response;
        return response.text().trim();
    } catch (err) {
        console.error('Gemini error:', err);
        return "I am currently unable to process that. Please try again later.";
    }
}

// ────────────────────────────────────────────────
//  Email helper function
// ────────────────────────────────────────────────
async function sendEmailAsync(to, subject, text) {
    const message = {
        from: '"Saylani Bot" <bilal317699@gmail.com>',
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
//  Chips helper functions
// ────────────────────────────────────────────────
function getChips(excludeIntent) {
    const options = [
        { text: "ℹ️ About Our Services", intent: "RotiBank_Info" },
        { text: "📍 Find Centers", intent: "RotiBank_Location" },
        { text: "💰 Make a Donation", intent: "RotiBank_Donate" },
        { text: "🎓 IT Course Registration", intent: "IT_Registration" },
        { text: "📅 Book Appointment", intent: "BookAppointment" }
    ];
    return options.filter(o => o.intent !== excludeIntent).map(o => ({ text: o.text }));
}

function addChips(agent, text, excludeIntent) {
    agent.add(text);
    agent.add(new Payload('PLATFORM_UNSPECIFIED', {
        richContent: [[
            { type: "chips", options: getChips(excludeIntent) }
        ]]
    }, { sendAsMessage: true, rawPayload: true }));
}

// ────────────────────────────────────────────────
//  Main webhook endpoint
// ────────────────────────────────────────────────
app.post('/dialogflow', async (req, res) => {
    const agent = new WebhookClient({ request: req, response: res });

    // Extract session ID (useful for logging)
    let sessionId = 'unknown';
    if (req.body.session && req.body.session.length > 43) {
        sessionId = (req.body.session).substr(43);
    } else if (req.body.session) {
        sessionId = req.body.session.split('/').pop();
    }
    console.log(`Webhook called — session: ${sessionId}`);

    // ── Welcome ─────────────────────────────────────
    function welcome(agent) {
        console.log(`intent  =>  hi`);
        agent.add('Hi, I am your virtual assistant, Tell me how can I help you');
    }

    // ── Roti Bank Info Intent ───────────────────────
    function rotiBankInfo(agent) {
        console.log("Handling RotiBank_Info");
        // Always add a text response first, which serves as a basic fallback
        agent.add("Saylani Roti Bank feeds 300,000+ people daily across 630+ centers.");

        try {
            // Attempt to add the rich card
            // We use 'PLATFORM_UNSPECIFIED' which typically works for custom payloads
            const payload = new Payload('PLATFORM_UNSPECIFIED', {
                richContent: [[
                    {
                        type: "image",
                        rawUrl: "https://i.pinimg.com/736x/9c/9a/ef/9c9aefcf49d7f51f9be204b650e7362e.jpg",
                        accessibilityText: "Saylani Logo"
                    },
                    {
                        type: "info",
                        title: "Saylani Dastarkhwan",
                        subtitle: "Feeding 300,000+ daily"
                    },
                    { type: "chips", options: getChips("RotiBank_Info") }
                ]]
            }, { sendAsMessage: true, rawPayload: true });

            agent.add(payload);
        } catch (e) {
            console.error("Payload Error:", e);
        }
    }

    // ── Locations Intent ────────────────────────────
    function locations(agent) {
        addChips(agent,
            "We have presence in Karachi, Lahore, Islamabad, Faisalabad and Hyderabad.\nCall 111-729-526 for the nearest center.",
            "RotiBank_Location"
        );
    }

    // ── Donation Intent ─────────────────────────────
    async function donation(agent) {
        const choice = (agent.parameters.Donation || "").toString();
        const query = agent.query;

        let message = `JazakAllah! To donate (${choice || "General"}):\n` +
            "1. Bank Transfer\n2. Online (saylaniwelfare.com)\n3. Visit any center.";

        // Logic: Send Email + Save to DB (Fire-and-forget for speed)
        (async () => {
            sendEmailAsync("bilal317693@gmail.com", "New Donation Query", `User interested in: ${choice}\nQuery: ${query}`);
            if (supabase) {
                const { error } = await supabase
                    .from('donations')
                    .insert([{ type: choice, query: query, date: new Date() }]);
                if (error) console.error("Supabase Donation Error:", error);
            }
        })();

        addChips(agent, message, "RotiBank_Donate");
    }

    // ── IT Registration Intent ──────────────────────
    async function itRegistration(agent) {
        const { person, Courses, email, phone } = agent.parameters;
        const name = person && person.name ? person.name : (person || "Student");

        const responseText = `Thank you ${name}.\nReceived request for: ${Courses}\nWe will contact you at ${phone} or ${email}.`;

        // Logic: Send Email + Save to DB (Fire-and-forget for speed)
        (async () => {
            sendEmailAsync("bilal317693@gmail.com", "New IT Registration", `Name: ${name}\nCourse: ${Courses}\nPhone: ${phone}\nEmail: ${email}`);

            if (email && email.includes("@")) {
                sendEmailAsync(email, "Registration Received - Saylani Mass IT", responseText);
            }

            if (supabase) {
                const { error } = await supabase
                    .from('it_registrations')
                    .insert([{
                        name: name,
                        course: Courses,
                        email: email,
                        phone: phone,
                        created_at: new Date()
                    }]);
                if (error) console.error("Supabase IT Registration Error:", error);
            }
        })();

        addChips(agent, responseText, "IT_Registration");
    }

    // ── Book Appointment Intent ─────────────────────
    function bookAppointment(agent) {
        const message = "You can book an appointment or consultation with the Saylani team:\n\n" +
            "1. Visit our official Calendly (if available) or call directly:\n" +
            "   UAN: 021-111-729-526\n" +
            "2. For IT Training related queries, register online:\n" +
            "   https://www.saylanimit.com/enroll\n" +
            "3. General meetings: Email us at saylanimass@gmail.com or call the UAN.\n\n" +
            "JazakAllah! We'll get back to you soon.";
        addChips(agent, message, "BookAppointment");
    }

    // ── Fallback / Unknown ──────────────────────────
    async function fallback(agent) {
        let action = req.body.queryResult.action;
        let queryText = req.body.queryResult.queryText;

        console.log(`Fallback processing for: ${queryText}`);

        try {
            const result = await Promise.race([
                getGeminiResponse(queryText),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 4000))
            ]);
            console.log("Gemini Response:", result);
            agent.add(result);
        } catch (err) {
            console.error("Gemini/Timeout Error:", err);
            agent.add("I'm currently experiencing heavy traffic. Please ask your question again.");
        }
    }

    // ── Intent Mapping ──────────────────────────────
    const intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('RotiBank_Info', rotiBankInfo);
    intentMap.set('RotiBank_Location', locations);
    intentMap.set('RotiBank_Donate', donation);
    intentMap.set('IT_Registration', itRegistration);
    intentMap.set('BookAppointment', bookAppointment);

    try {
        // AWAIT IS CRITICAL HERE
        await agent.handleRequest(intentMap);
    } catch (err) {
        console.error("Critical Webhook Error:", err.message);
        // SAFELY RETURN 200 with JSON to prevent 500 error in Dialogflow
        if (!res.headersSent) {
            return res.json({
                fulfillmentText: "I'm having a technical issue, but I'm here to help. Could you try asking that again?"
            });
        }
    }
});

// ────────────────────────────────────────────────
//  Start server
// ────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}   →   http://localhost:${PORT}/`);
    console.log(`Webhook endpoint:                 /dialogflow`);
});

module.exports = app;